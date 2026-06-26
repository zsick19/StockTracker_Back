import Stock from '../models/Stock';

const cron = require('node-cron')
const EnterExitPlannedStock = require('../models/EnterExitPlannedStock')
const asyncHandler = require("express-async-handler");
const User = require('../models/User');
const Alpaca = require('@alpacahq/alpaca-trade-api');
const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });

const { isBefore, addBusinessDays, subDays, isWeekend, subBusinessDays } = require('date-fns');
const { sectorToTicker } = require('./sectorAndTicker');
const { retryOperation } = require('./sharedUtility');

const { calculateNightlyCorrelation } = require('./technicalCalculations/DailyMacroMetrics/correlationCalculation');
const { calculateNightlyBeta } = require('./technicalCalculations/DailyMacroMetrics/betaCalculation');
const { calculateATR } = require('./technicalCalculations/DailyMacroMetrics/calculateATR');
const { calculateEMADataPoints } = require('./technicalCalculations/DailyMacroMetrics/dailyEMADataPoints');
const { calculateCurrentSingleRSI } = require('./technicalCalculations/DailyMacroMetrics/calculateRSI');

const { projectAdaptiveChannelWithOptimizedCeiling } = require('./technicalCalculations/DailyPatternGenerators/horizontalPatternGenerator');
const { projectContinuationTrendMetrics } = require('./technicalCalculations/DailyPatternGenerators/continuationPatternGenerator');
const { processNightlyCascadeMaintenance } = require('./technicalCalculations/DailyPatternGenerators/nightlyCascadeMaintenance');

const { seedHistoricalVolumeWithPreMarket } = require('./technicalCalculations/IntraDayMetrics/morningVolumeMetrics');
const { calculateExtendedSessionProbabilities } = require('./technicalCalculations/IntraDayMetrics/highLowProbabilityMetric');
const { calculateOpenTimeAndStretchMetrics } = require('./technicalCalculations/IntraDayMetrics/openTimeAndStretchMetrics');
const { calculateHighLowTimeDistribution } = require('./technicalCalculations/IntraDayMetrics/highLowTimeSlotDistribution');
const { calculateNightlyDailyVolumePoc } = require('./technicalCalculations/DailyPatternGenerators/patternPOC');
const { executeNightlyVolumeProfilePass } = require('./ScheduledTasks/nightlyVolumeProfile');

const { fetchBatchWeeklyOptionsContracts } = require('./ScheduledTasks/OptionsMarketData/optionsIngestionJob')


// const TradeRecord = require("../models/TradeRecord");


const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


/**
 * Production Watchlist Chunker.
 * Splits an array of any size into smaller, controlled operational batches.
 */

function chunkArray(array, size)
{
    const result = [];
    for (let i = 0; i < array.length; i += size) { result.push(array.slice(i, i + size)) }
    return result;
}






async function updateHighImportanceAndTradeMorningMetrics()
{
    const importantEnterExitPlans = await EnterExitPlannedStock.find({
        $or: [
            { highImportance: { $exists: true, $ne: null } },
            { tradeEnterDate: { $exists: true, $ne: null } }
        ]
    }).exec();
    if (importantEnterExitPlans.length === 0) return

    for (const enterExitPlan of importantEnterExitPlans)
    {
        try
        {
            await retryOperation(async () =>
            {
                const startDate = enterExitPlan?.relevantCandleDate
                const fiveMinCandles = await alpaca.getBarsV2(enterExitPlan.tickerSymbol, { timeframe: alpaca.newTimeframe(5, alpaca.timeframeUnit.MIN), start: startDate })
                const fiveMinCandleData = [];
                for await (let b of fiveMinCandles) { fiveMinCandleData.push(b); }

                if (fiveMinCandleData && fiveMinCandleData.length > 0)
                {
                    const extentProbResults = calculateExtendedSessionProbabilities(fiveMinCandleData)
                    const morningMetricsResults = calculateOpenTimeAndStretchMetrics(fiveMinCandleData)
                    const extremeProbByFiveMin = calculateHighLowTimeDistribution(fiveMinCandleData)

                    let openVolumeMetrics
                    if (morningMetricsResults.upSide?.averageTimeToPeak && morningMetricsResults.downSide?.averageTimeToBottom)
                        openVolumeMetrics = seedHistoricalVolumeWithPreMarket(fiveMinCandleData, morningMetricsResults.upSide.averageTimeToPeak, morningMetricsResults.downSide.averageTimeToBottom)


                    const updatedEnterExitPlan = await EnterExitPlannedStock.findByIdAndUpdate(enterExitPlan._id, {
                        $set: {
                            extentProb: extentProbResults,
                            morningMetrics: morningMetricsResults,
                            morningVolumeMetrics: openVolumeMetrics,
                            extremeProbByFiveMin: extremeProbByFiveMin,

                        }
                    })
                    await delay(3000);
                }
            })
        } catch (error)
        {
            console.log(error)
            console.log(`${enterExitPlan.tickerSymbol} was not updated`)
        }
    }

    console.log(`${importantEnterExitPlans.length} High Importance Plans and Trades were updated with metrics`)
}

async function updateMorningMetricsPreOpen()
{
    const foundPlans = await EnterExitPlannedStock.find().select('tickerSymbol')

    let totalPlanCount = 0
    let tickerList = foundPlans.map(t =>
    {
        totalPlanCount++
        return { symbol: t.tickerSymbol }
    })
    let startDate = subBusinessDays(new Date(), 15)




    // Split your massive list into safe 50-ticker sub-arrays
    const batches = chunkArray(tickerList, 50);
    // Sequential loop through chunks to protect API rate limits
    for (const [index, batch] of batches.entries())
    {
        try
        {
            const onlyTickersFromBatch = tickerList.map(t => t.symbol)
            const fiveMinCandles = await alpaca.getMultiBarsV2(onlyTickersFromBatch, { timeframe: alpaca.newTimeframe(5, alpaca.timeframeUnit.MIN), start: subBusinessDays(new Date(), 15), })

            const bulkOperations = [];
            // Map over the chunk keys to perform calculations
            for (const stock of batch)
            {
                const fiveMinCandleData = fiveMinCandles.get(stock.symbol)

                if (fiveMinCandleData && fiveMinCandleData.length > 0)
                {
                    const extentProbResults = calculateExtendedSessionProbabilities(fiveMinCandleData)
                    const morningMetricsResults = calculateOpenTimeAndStretchMetrics(fiveMinCandleData)
                    const extremeProbByFiveMin = calculateHighLowTimeDistribution(fiveMinCandleData)

                    let openVolumeMetrics
                    if (morningMetricsResults.upSide?.averageTimeToPeak && morningMetricsResults.downSide?.averageTimeToBottom)
                        openVolumeMetrics = seedHistoricalVolumeWithPreMarket(fiveMinCandleData, morningMetricsResults.upSide.averageTimeToPeak, morningMetricsResults.downSide.averageTimeToBottom)

                    bulkOperations.push({
                        updateOne: {
                            filter: { tickerSymbol: stock.symbol },
                            update: {
                                $set: {
                                    extentProb: extentProbResults,
                                    morningMetrics: morningMetricsResults,
                                    morningVolumeMetrics: openVolumeMetrics,
                                    extremeProbByFiveMin: extremeProbByFiveMin,
                                    dateMorningMetricsLastCalculated: new Date()
                                }
                            },
                            upsert: true
                        }
                    });
                }
                else
                {
                    console.log(`Ticker ${stock.symbol} didn't fetch any data.`)
                }
            }

            if (bulkOperations.length > 0)
            {
                const result = await EnterExitPlannedStock.bulkWrite(bulkOperations);
                console.log(`Successfully updated database for batch ${index + 1} of Morning Metrics. Modified: ${result.upsertedCount + result.modifiedCount}`);
            }

            await new Promise(resolve => setTimeout(resolve, 2000));

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
    let tickerList = foundPlans.map(t =>
    {
        totalPlanCount++
        let anchorDate = undefined
        if (t?.cascadePattern.anchorDate) anchorDate = t.cascadePattern.anchorDate
        else if (t?.channelPattern.anchorDate) anchorDate = t.channelPattern.anchorDate
        else if (t?.continuationPattern.anchorDate) anchorDate = t.continuationPattern.anchorDate

        return { symbol: t.tickerSymbol, sector: t.sector, relevantCandleDate: t.relevantCandleDate, classification: t.patternClassification, anchor: anchorDate, cascadePattern: t?.cascadePattern }
    })



    // Split your massive list into safe 50-ticker sub-arrays
    const batches = chunkArray(tickerList, 50);
    const sectorDailyBar = await alpaca.getMultiBarsV2(['SPY', 'QQQ', 'DIA', 'IWM', 'XLV', 'XLP', 'XLI', 'XLC', 'XLU', 'XLK', 'XLF', "XLB", 'XLE', 'XLY', 'XLRE'],
        { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.DAY), start: subBusinessDays(new Date(), 180) })


    for (const [index, batch] of batches.entries())
    {
        try
        {
            const onlyTickersFromBatch = tickerList.map(t => t.symbol)

            const [barsMap, snapshotsMap] = await Promise.all([
                alpaca.getMultiBarsV2(onlyTickersFromBatch, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.DAY), start: subBusinessDays(new Date(), 180), }),
                alpaca.getSnapshots(onlyTickersFromBatch)
            ]);

            const bulkOperations = [];
            // Map over the chunk keys to perform calculations
            for (const stock of batch)
            {
                const candleData = barsMap.get(stock.symbol);
                const snapShot = snapshotsMap.find(t => t.symbol === stock.symbol);

                let calculatedDailyValues
                let calculatedCorrelationValues
                let channelPattern
                let cascadePattern
                let continuationPattern
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
                            let POC = calculateNightlyDailyVolumePoc(candleData, stock.relevantCandleDate)

                            let nightlyResults = processNightlyCascadeMaintenance(stock.cascadePattern, candleData.at(-1))
                            if (nightlyResults.systemStatus === 'OVERWRITE_PEAK_ANCHOR')
                            {
                                cascadePattern = {
                                    ...stock.cascadePattern,
                                    projection: {
                                        ...stock.cascadePattern.projection,
                                        patternPocCeiling: POC,
                                        anchorPeak: nightlyResults.updatedFields.anchorPeak.price,
                                        priceIdeal: nightlyResults.updatedFields.priceIdeal,
                                        projectedDate: addBusinessDays(nightlyResults.updatedFields.anchorPeak.date, stock.cascadePattern.projection.avgDownDuration),
                                        priceFloor: parseFloat((nightlyResults.updatedFields.priceIdeal - (nightlyResults.updatedFields.priceIdeal * (stock.cascadePattern.projection.buffer / 100))).toFixed(2)),
                                        priceCeiling: parseFloat((nightlyResults.updatedFields.priceIdeal + (nightlyResults.updatedFields.priceIdeal * (stock.cascadePattern.projection.buffer / 100))).toFixed(2))
                                    },
                                    points: [...stock.cascadePattern.points.slice(0, -1), nightlyResults.updatedFields.anchorPeak]
                                }
                            } else
                            {
                                cascadePattern = {
                                    ...stock.cascadePattern,
                                    projection: {
                                        ...stock.cascadePattern.projection,
                                        patternPocCeiling: POC,

                                    }
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




                //Construct efficient upsert bulk actions
                bulkOperations.push({
                    updateOne: {
                        filter: { tickerSymbol: stock.symbol },
                        update: {
                            $set: {
                                dailyTickerValues: calculatedDailyValues,
                                correlationValues: calculatedCorrelationValues,
                                greatestCorrelation: maxCorrelation,
                                channelPattern: channelPattern,
                                continuationPattern: continuationPattern,
                                cascadePattern: cascadePattern,
                                datePatternLastCalculated: new Date()
                            }
                        },
                        upsert: true
                    }
                });
            }

            // Execute all 50 database modifications in one network payload
            if (bulkOperations.length > 0)
            {
                const result = await EnterExitPlannedStock.bulkWrite(bulkOperations);
                console.log(`Successfully updated database for batch ${index + 1} of Daily Values. Modified: ${result.upsertedCount + result.modifiedCount}`);
            }

            await new Promise(resolve => setTimeout(resolve, 3000));

        } catch (batchError)
        {
            console.error(`Error encountered processing batch ${index + 1}:`, batchError.message);
            // Script continues to next batch safely instead of crashing completely
        }
    }
}



/**
 * Master Scheduled Options Pipeline Orchestrator.
 * Safely throttles your entire active watchlist using 20-stock chunks to fully
 * prevent data truncation, rate limiting, and memory overload.
 */
async function runCappedBatchOptionsPass()
{

    const foundPlans = await EnterExitPlannedStock.find().select('tickerSymbol')

    let tickerList = foundPlans.map(t => t.tickerSymbol)
    const fullWatchlistSymbols = await Stock.find({
        nameSymbolField: { $in: tickerList },
        HasOptions: true
    });


    results.filter(doc => doc !== null);

    console.log(`🌙 Initializing Throttled Options Pass for ${fullWatchlistSymbols.length} assets...`);


    // Split your full 60-ticker watchlist into clean, managed batches of 20
    const targetedBatches = chunkArray(fullWatchlistSymbols, 20);
    let masterUnifiedContractsDictionary = {};

    for (const activeBatch of targetedBatches)
    {
        try
        {
            console.log(`🚀 Dispatching Throttled Sub-Batch Query for: [${activeBatch.join(', ')}]`);

            // Invoke your existing batch request HTTPS utility script
            // Each call stays well under the 10,000 options contract page response cap!
            const batchContractsResult = await fetchBatchWeeklyOptionsContracts(activeBatch);

            // Merge the sub-batch dictionary directly into your master results layer
            masterUnifiedContractsDictionary = {
                ...masterUnifiedContractsDictionary,
                ...batchContractsResult
            };

            // Introduce a brief 500ms network cooldown pause to completely protect your server 
            // from hitting Alpaca rate limits or throttling gates
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (subBatchError)
        {
            console.error(`❌ Ingestion Failure inside active batch:`, subBatchError);
        }
    }

    // Return your pristine, completely populated multi-asset data dictionary map
    return masterUnifiedContractsDictionary;
}











function initScheduler()
{
    console.log('Scheduler is initialized')
    cron.schedule('20 9 * * *', () => { if (!isWeekend(new Date())) updateMorningMetricsPreOpen() })
    cron.schedule('25 9 * * *', () => { if (!isWeekend(new Date())) updateHighImportanceAndTradeMorningMetrics() })

    cron.schedule('30 16 * * *', () => { if (!isWeekend(new Date())) updateDailyValuesPostClose() })
    cron.schedule('30 16 * * *', () => { if (!isWeekend(new Date())) executeNightlyVolumeProfilePass() })
}

module.exports = { initScheduler };