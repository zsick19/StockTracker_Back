const cron = require('node-cron')
const EnterExitPlannedStock = require('../models/EnterExitPlannedStock')
const asyncHandler = require("express-async-handler");
const User = require('../models/User');
const Alpaca = require('@alpacahq/alpaca-trade-api');
const { calculateEMADataPoints, calculateATR, calculateCurrentSingleRSI, calculateExtendedSessionProbabilities, calculateCompleteMorningMetrics, calculateCorrelation, seedHistoricalOpeningHourVolume, calculateMorningWalls } = require('./technicalIndicators');
const { subBusinessDays } = require('date-fns/subBusinessDays');
const { sectorToTicker } = require('./sectorAndTicker');
const { retryOperation } = require('./sharedUtility');
const { calculateNightlyCorrelation } = require('./technicalCalculations/correlationCalculation');
const { calculateNightlyBeta } = require('./technicalCalculations/betaCalculation');
const { isBefore } = require('date-fns/isBefore');
const { projectAdaptiveChannelWithOptimizedCeiling } = require('./technicalCalculations/DailyPatternGenerators/horizontalPatternGenerator');
const { projectContinuationTrendMetrics } = require('./technicalCalculations/DailyPatternGenerators/continuationPatternGenerator');
const { processNightlyCascadeMaintenance } = require('./technicalCalculations/DailyPatternGenerators/nightlyCascadeMaintenance');
const { addBusinessDays } = require('date-fns/addBusinessDays');
const { seedHistoricalVolumeWithPreMarket } = require('./technicalCalculations/IntraDayMetrics/morningVolumeMetrics');
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

                const morningVolResults = seedHistoricalVolumeWithPreMarket(candleData, morningMetricsResults.upsideMetrics.averageTimeToPeak, morningMetricsResults.downsideMetrics.averageTimeToBottom)
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
async function updateVolumePreOpen()
{
    const foundPlans = await EnterExitPlannedStock.find().select('tickerSymbol relevantCandleDate')

    let totalPlanCount = 0
    let oldestRelevantDate = new Date()
    let tickerList = foundPlans.map(t =>
    {
        if (isBefore(t.relevantCandleDate, oldestRelevantDate)) oldestRelevantDate = t.relevantCandleDate
        totalPlanCount++
        // console.log(t)

        return { symbol: t.tickerSymbol, relevantCandleDate: t?.relevantCandleDate }
    })

    //oldestRelevantDate = new Date(oldestRelevantDate).toISOString().split('T')[0];

    function chunkArray(array, size)
    {
        const result = [];
        for (let i = 0; i < array.length; i += size) { result.push(array.slice(i, i + size)) }
        return result;
    }

    // const startDate = subBusinessDays(new Date(), 180 + 10)

    // const sectorDailyBar = await alpaca.getMultiBarsV2(['SPY', 'QQQ', 'DIA', 'IWM', 'XLV', 'XLP', 'XLI', 'XLC', 'XLU', 'XLK', 'XLF', "XLB", 'XLE', 'XLY', 'XLRE'],
    //     { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.DAY), start: startDate })


    // Split your massive list into safe 50-ticker sub-arrays
    const batches = chunkArray(tickerList, 50);
    // Sequential loop through chunks to protect API rate limits
    for (const [index, batch] of batches.entries())
    {
        try
        {
            const onlyTickersFromBatch = tickerList.map(t => t.symbol)
            //const [fiveMinCandles, snapshotsMap] = await alpaca.getMultiBarsV2(onlyTickersFromBatch, { timeframe: alpaca.newTimeframe(5, alpaca.timeframeUnit.MIN), start: oldestRelevantDate, })

            const bulkOperations = [];
            // Map over the chunk keys to perform calculations
            for (const stock of batch)
            {
                if (!stock.relevantCandleDate)
                {
                    console.log(stock)

                    //     // let fiveMin = fiveMinCandles.get(stock.symbol)
                    //     // const time = new Date(stock.relevantCandleDate).getTime()

                    //     // let fiveMinCandleData = fiveMin.filter(t => { return new Date(t.Timestamp).getTime() < time })

                    //     // let extentProb

                    //     // if (fiveMinCandleData && fiveMinCandleData.length > 0)
                    //     // {
                    //     //     let extentProbResults = calculateExtendedSessionProbabilities(fiveMinCandleData)
                    //     //     let morningMetricsResults = calculateCompleteMorningMetrics(fiveMinCandleData)
                    //     //     let openVolumeMetrics = seedHistoricalVolumeWithPreMarket(fiveMinCandleData, morningMetricsResults.upsideMetrics.averageTimeToPeak, morningMetricsResults.downsideMetrics.averageTimeToBottom)

                    //     // }

                    //     console.log(stock.relevantCandleDate)
                    //     //Construct efficient upsert bulk actions
                    bulkOperations.push({
                        updateOne: {
                            filter: { tickerSymbol: stock.symbol },
                            update: {
                                $set: {
                                    updateNeededDate: new Date()
                                    //                               dateMorningMetricsLastCalculated:new Date()
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




async function updateDailyValuesPostClose()
{

    const foundPlans = await EnterExitPlannedStock.find()
        .select('tickerSymbol sector relevantCandleDate patternClassification cascadePattern channelPattern.anchorDate continuationPattern.anchorDate')

    let totalPlanCount = 0
    let oldestRelevantDate = new Date()
    let tickerList = foundPlans.map(t =>
    {
        if (isBefore(t.relevantCandleDate, oldestRelevantDate)) oldestRelevantDate = t.relevantCandleDate
        totalPlanCount++
        let anchorDate = undefined
        if (t?.cascadePattern.anchorDate) anchorDate = t.cascadePattern.anchorDate
        else if (t?.channelPattern.anchorDate) anchorDate = t.channelPattern.anchorDate
        else if (t?.continuationPattern.anchorDate) anchorDate = t.continuationPattern.anchorDate

        return { symbol: t.tickerSymbol, sector: t.sector, relevantCandleDate: t.relevantCandleDate, classification: t.patternClassification, anchor: anchorDate, cascadePattern: t?.cascadePattern }
    })
    oldestRelevantDate = new Date(oldestRelevantDate).toISOString().split('T')[0];

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

            const [barsMap, fiveMinCandles, snapshotsMap] = await Promise.all([
                alpaca.getMultiBarsV2(onlyTickersFromBatch, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.DAY), start: startDate, }),
                alpaca.getMultiBarsV2(onlyTickersFromBatch, { timeframe: alpaca.newTimeframe(5, alpaca.timeframeUnit.MIN), start: oldestRelevantDate, }),
                alpaca.getSnapshots(onlyTickersFromBatch)
            ]);

            const bulkOperations = [];
            // Map over the chunk keys to perform calculations
            for (const stock of batch)
            {
                const candleData = barsMap.get(stock.symbol);
                let fiveMin = fiveMinCandles.get(stock.symbol)
                const time = new Date(stock.relevantCandleDate.date).getTime()



                let fiveMinCandleData = fiveMin.filter(t => { return new Date(t.Timestamp).getTime() < time })
                const snapShot = snapshotsMap.find(t => t.symbol === stock.symbol);

                let calculatedDailyValues
                let calculatedCorrelationValues
                let channelPattern
                let cascadePattern
                let continuationPattern
                let extentProb
                let maxCorrelation = null;

                if (candleData && candleData.length > 0)
                {

                    calculatedDailyValues = {
                        ema9: calculateEMADataPoints(candleData, 9),
                        ema50: calculateEMADataPoints(candleData, 50),
                        ema200: calculateEMADataPoints(candleData, 200),
                        atr: calculateATR(candleData),
                        rsi: calculateCurrentSingleRSI(candleData),
                        spyBetaValue: calculateNightlyBeta(candleData, sectorDailyBar.get('SPY')),
                        PrevDailyBar: snapShot?.PrevDailyBar || undefined,
                        DailyBar: snapShot?.DailyBar || undefined,
                    }

                    calculatedCorrelationValues = {
                        SPY: calculateNightlyCorrelation(candleData, sectorDailyBar.get('SPY')),
                        QQQ: calculateNightlyCorrelation(candleData, sectorDailyBar.get('QQQ')),
                        IWM: calculateNightlyCorrelation(candleData, sectorDailyBar.get('IWM')),
                        DIA: calculateNightlyCorrelation(candleData, sectorDailyBar.get('DIA')),
                        sector: calculateNightlyCorrelation(candleData, sectorDailyBar.get(sectorToTicker[stock.sector]))
                    }

                    let maxValue = -Infinity;
                    for (const [key, value] of Object.entries(calculatedCorrelationValues))
                    {
                        if (key === 'sector' || key === null) { continue; }
                        if (value.correlation30Day > maxValue)
                        {
                            maxValue = value.correlation30Day;
                            maxCorrelation = key;
                        }
                    }

                    switch (stock.classification)
                    {
                        case 'cascade':
                            let nightlyResults = processNightlyCascadeMaintenance(stock.cascadePattern, candleData.at(-1))
                            if (nightlyResults.systemStatus === 'OVERWRITE_PEAK_ANCHOR')
                            {
                                cascadePattern = {
                                    ...stock.cascadePattern,
                                    projection: {
                                        ...stock.cascadePattern.projection,
                                        anchorPeak: nightlyResults.updatedFields.anchorPeak.price,
                                        priceIdeal: nightlyResults.updatedFields.priceIdeal,
                                        projectedDate: addBusinessDays(nightlyResults.updatedFields.anchorPeak.date, stock.cascadePattern.projection.avgDownDuration),
                                        priceFloor: parseFloat((nightlyResults.updatedFields.priceIdeal - (nightlyResults.updatedFields.priceIdeal * (stock.cascadePattern.projection.buffer / 100))).toFixed(2)),
                                        priceCeiling: parseFloat((nightlyResults.updatedFields.priceIdeal + (nightlyResults.updatedFields.priceIdeal * (stock.cascadePattern.projection.buffer / 100))).toFixed(2))
                                    },
                                    points: [...stock.cascadePattern.points.slice(0, -1), nightlyResults.updatedFields.anchorPeak]
                                }
                            }
                            break;
                        case 'channel':
                            channelPattern = projectAdaptiveChannelWithOptimizedCeiling(candleData, stock.anchor, 5, calculatedDailyValues.spyBetaValue)
                            break;
                        case 'continuation':
                            continuationPattern = projectContinuationTrendMetrics(candleData, stock.anchor, calculatedDailyValues.spyBetaValue)
                            break;
                    }
                }

                if (fiveMinCandleData && fiveMinCandleData.length > 0)
                {
                    let extentProbResults = calculateExtendedSessionProbabilities(fiveMinCandleData)
                    let morningMetricsResults = calculateCompleteMorningMetrics(fiveMinCandleData)
                    let openVolumeMetrics = seedHistoricalVolumeWithPreMarket(fiveMinCandleData, morningMetricsResults.upsideMetrics.averageTimeToPeak, morningMetricsResults.downsideMetrics.averageTimeToBottom)
                    console.log(stock.symbol)
                    console.log(extentProbResults)
                    console.log(morningMetricsResults)
                    console.log(openVolumeMetrics)
                }


                // Construct efficient upsert bulk actions
                // bulkOperations.push({
                //     updateOne: {
                //         filter: { tickerSymbol: stock.symbol },
                //         update: {
                //             $set: {
                //                 dailyTickerValues: calculatedDailyValues,
                //                 correlationValues: calculatedCorrelationValues,
                //                 greatestCorrelation: maxCorrelation,
                //                 channelPattern: channelPattern,
                //                 continuationPattern: continuationPattern,
                //                 cascadePattern: cascadePattern,
                //                 datePatternLastCalculated: new Date()
                //             }
                //         },
                //         upsert: true
                //     }
                // });
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
    //    updateDailyValuesPostClose()
    //updateVolumePreOpen()
    cron.schedule('15 9 * * *', () => { trialForOptions() })
    cron.schedule('25 9 * * *', () => { updateOpenVolume() })
    cron.schedule('30 16 * * *', () => { updateDailyValuesPostClose() })
}

module.exports = { initScheduler };