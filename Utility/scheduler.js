const cron = require('node-cron')
const EnterExitPlannedStock = require('../models/EnterExitPlannedStock')
const asyncHandler = require("express-async-handler");
const User = require('../models/User');
const Alpaca = require('@alpacahq/alpaca-trade-api');
const { calculateEMADataPoints, calculateATR, calculateCurrentSingleRSI, seedHistoricalVolumeWithPreMarket, calculateExtendedSessionProbabilities, calculateCompleteMorningMetrics, calculateCorrelation, seedHistoricalOpeningHourVolume, calculateMorningWalls } = require('./technicalIndicators');
const { subBusinessDays } = require('date-fns/subBusinessDays');
const { sectorToTicker } = require('./sectorAndTicker');
const { retryOperation } = require('./sharedUtility');
const { calculateNightlyCorrelation } = require('./technicalCalculations/correlationCalculation');
const { calculateNightlyBeta } = require('./technicalCalculations/betaCalculation');
const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });

// const TradeRecord = require("../models/TradeRecord");


const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function trialForOptions()
{
    const underlyingSymbol = 'EOSE';

    // 2. Query and pipeline routing parameters
    // FIX: Passing timeframe bypasses the legacy SDK internal validation bug
    const queryParams = {
        feed: 'opra',         // Options data source feed
        // type: 'call',         // Optional: filter 'call' or 'put'
        limit: 100,           // Optional: quantity per page limit (Max 1000)
        // timeframe: '1Day'     // Dummy property to prevent SDK errors
    };

    console.log(`Fetching full options chain snapshots for: ${underlyingSymbol}...`);

    // Call the specific option chain data client mapping
    const chain = await alpaca.getOptionChain(underlyingSymbol, queryParams);
    const callPutWallResults = calculateMorningWalls(chain)
    console.log(callPutWallResults)



}


async function updateOpenVolume()
{
    console.log('Morning Metric Scheduler Is Executing')

    const importantEnterExitPlans = await EnterExitPlannedStock.find({
        $or: [
            { highImportance: { $exists: true, $ne: null } },
            { tradeEnterDate: { $exists: true, $ne: null } }
        ]
    }).exec();
    if (importantEnterExitPlans.length === 0) return



    for (const enterExitPlan of importantEnterExitPlans)
    {
        const startDate = enterExitPlan?.relevantCandleDate ? new Date(enterExitPlan.relevantCandleDate) : subBusinessDays(new Date(), 45)
        try
        {

            await retryOperation(async () =>
            {
                const fiveMinCandles = await alpaca.getBarsV2(enterExitPlan.tickerSymbol,
                    { timeframe: alpaca.newTimeframe(5, alpaca.timeframeUnit.MIN), start: startDate })
                const candleData = [];
                for await (let b of fiveMinCandles) { candleData.push(b); }

                const probability = calculateExtendedSessionProbabilities(candleData)
                const morningMetricsResults = calculateCompleteMorningMetrics(candleData)

                let extentProb = {
                    openH: probability.morningSession.highPrintedPercent,
                    openL: probability.morningSession.lowPrintedPercent,
                    midH: probability.middaySession.highPrintedPercent,
                    midL: probability.middaySession.lowPrintedPercent,
                    closeH: probability.closingSession.highPrintedPercent,
                    closeL: probability.closingSession.lowPrintedPercent,
                    dateCalculated: new Date()
                }
                let morningMetrics = { upSide: { ...morningMetricsResults.upsideMetrics }, downSide: { ...morningMetricsResults.downsideMetrics }, dateCalculated: new Date() }

                const morningVolResults = seedHistoricalVolumeWithPreMarket(candleData, morningMetricsResults.upsideMetrics.averageTimeToPeak,
                    morningMetricsResults.downsideMetrics.averageTimeToBottom)
                const updatedEnterExitPlan = await EnterExitPlannedStock.findByIdAndUpdate(enterExitPlan._id, {
                    $set: {
                        extentProb: extentProb,
                        morningMetrics: morningMetrics,
                        morningVolumeMetrics: morningVolResults
                    }
                })
                await delay(3000);
            })
        } catch (error)
        {
            console.log(error)
            console.log(`${enterExitPlan.tickerSymbol} was not updated`)
        }
    }

    console.log(`${importantEnterExitPlans.length} plans were updated with metrics`)


}
async function updateDailyValuesPostClose()
{
    const foundPlans = await EnterExitPlannedStock.find().select('tickerSymbol sector')

    let totalPlanCount = 0
    let tickerList = foundPlans.map(t =>
    {
        totalPlanCount++
        return { symbol: t.tickerSymbol, sector: t.sector }
    })

    function chunkArray(array, size)
    {
        const result = [];
        for (let i = 0; i < array.length; i += size) { result.push(array.slice(i, i + size)) }
        return result;
    }

    // Split your massive list into safe 50-ticker sub-arrays
    const batches = chunkArray(tickerList, 50);
    const startDate = subBusinessDays(new Date(), 180 + 10)

    // Sequential loop through chunks to protect API rate limits

    const sectorDailyBar = await alpaca.getMultiBarsV2(['SPY', 'QQQ', 'DIA', 'IWM', 'XLV', 'XLP', 'XLI', 'XLC', 'XLU', 'XLK', 'XLF', "XLB", 'XLE', 'XLY', 'XLRE'],
        { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.DAY), start: startDate })


    for (const [index, batch] of batches.entries())
    {
        try
        {
            const onlyTickersFromBatch = tickerList.map(t => t.symbol)
            //if current time is past 4pm use today otherwise use yesterday

            const [barsMap, snapshotsMap] = await Promise.all([
                alpaca.getMultiBarsV2(onlyTickersFromBatch,
                    {
                        timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.DAY),
                        start: startDate,
                    }),
                alpaca.getSnapshots(onlyTickersFromBatch)
            ]);

            const candleSPYData = sectorDailyBar.get('SPY')

            const bulkOperations = [];
            // Map over the chunk keys to perform calculations
            for (const stock of batch)
            {
                const candleData = barsMap.get(stock.symbol);
                const snapShot = snapshotsMap.find(t => t.symbol === stock.symbol);

                if (candleData && candleData.length > 0)
                {

                    const calculatedValues = {
                        ema9: calculateEMADataPoints(candleData, 9),
                        ema50: calculateEMADataPoints(candleData, 50),
                        ema200: calculateEMADataPoints(candleData, 200),
                        atr: calculateATR(candleData),
                        rsi: calculateCurrentSingleRSI(candleData),
                        PrevDailyBar: snapShot?.PrevDailyBar || undefined,
                        DailyBar: snapShot?.DailyBar || undefined,
                        dateCalculated: new Date()
                    }

                    // const calculatedCorrelationValues = {
                    //     SPY: calculateCorrelation(candleData, sectorDailyBar.get('SPY')),
                    //     QQQ: calculateCorrelation(candleData, sectorDailyBar.get('QQQ')),
                    //     IWM: calculateCorrelation(candleData, sectorDailyBar.get('IWM')),
                    //     DIA: calculateCorrelation(candleData, sectorDailyBar.get('DIA')),
                    //     sector: calculateCorrelation(candleData, sectorDailyBar.get(sectorToTicker[stock.sector]))
                    // }

                    const calculatedCorrelationValues = {
                        SPY: calculateNightlyCorrelation(candleData, sectorDailyBar.get('SPY')),
                        QQQ: calculateNightlyCorrelation(candleData, sectorDailyBar.get('QQQ')),
                        IWM: calculateNightlyCorrelation(candleData, sectorDailyBar.get('IWM')),
                        DIA: calculateNightlyCorrelation(candleData, sectorDailyBar.get('DIA')),
                        sector: calculateNightlyCorrelation(candleData, sectorDailyBar.get(sectorToTicker[stock.sector]))
                    }

                    let maxCorrelation = null;
                    let maxValue = -Infinity; // Starts at lowest possible number

                    for (const [key, value] of Object.entries(calculatedCorrelationValues))
                    {
                        if (key === 'sector' || key === null) { continue; }
                        if (value.correlation30Day > maxValue)
                        {
                            maxValue = value.correlation30Day;
                            maxCorrelation = key;
                        }
                    }

                    const betaCalc = calculateNightlyBeta(candleData, sectorDailyBar.get('SPY'))


                    // Construct efficient upsert bulk actions
                    bulkOperations.push({
                        updateOne: {
                            filter: { tickerSymbol: stock.symbol },
                            update: {
                                $set: {
                                    dailyTickerValues: calculatedValues,
                                    correlationValues: calculatedCorrelationValues,
                                    greatestCorrelation: maxCorrelation,
                                    spyBetaValue: betaCalc
                                }
                            },
                            upsert: true
                        }
                    });
                }
            }

            // Execute all 50 database modifications in one network payload
            if (bulkOperations.length > 0)
            {
                const result = await EnterExitPlannedStock.bulkWrite(bulkOperations);
                console.log(`Successfully updated database for batch ${index + 1}. Upserted/Modified: ${result.upsertedCount + result.modifiedCount}`);
            }

            // Optional short cooldown to avoid hitting Alpaca tier ceilings
            await new Promise(resolve => setTimeout(resolve, 200));

        } catch (batchError)
        {
            console.error(`Error encountered processing batch ${index + 1}:`, batchError.message);
            // Script continues to next batch safely instead of crashing completely
        }
    }

}



function initScheduler()
{
    console.log('Scheduler is initialized')
    updateDailyValuesPostClose()
    cron.schedule('15 9 * * *', () => { trialForOptions() })
    cron.schedule('25 9 * * *', () => { updateOpenVolume() })
    cron.schedule('30 16 * * *', () => { updateDailyValuesPostClose() })
}

module.exports = { initScheduler };