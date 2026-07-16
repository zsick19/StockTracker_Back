const cron = require('node-cron')
const EnterExitPlannedStock = require('../models/EnterExitPlannedStock')
const Stock = require('../models/Stock')
const asyncHandler = require("express-async-handler");
const User = require('../models/User');
const Alpaca = require('@alpacahq/alpaca-trade-api');
const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });

const { isBefore, addBusinessDays, subDays, isWeekend, subBusinessDays, previousThursday, previousMonday, previousTuesday, previousWednesday, previousFriday, isAfter, differenceInBusinessDays } = require('date-fns');
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

const { fetchBatchWeeklyOptionsContracts } = require('./ScheduledTasks/OptionsMarketData/optionsIngestionJob');
const { compileChannelHistoricalAbsorptionWindow } = require('./ScheduledTasks/priceAbsorptionWindow');
const { compileDualZoneAccumulationMetrics } = require('./ScheduledTasks/retailVsInstitution');
const { calculateThreeDayOneMinVolumeBaseline } = require('./ScheduledTasks/threeDayOneMinAverage');
const { calculateIntraDayVolumeDistribution } = require('./technicalCalculations/IntraDayMetrics/volumeDistribution');
const { reviewOpeningMinuteTape } = require('./technicalCalculations/IntraDayMetrics/openingMinuteTradeReview');
const { processMultiDayCrossTrend } = require('./technicalCalculations/IntraDayMetrics/processMultiDayCrossTrend');
const { processBackTests } = require('./ScheduledTasks/backTestAverages');



const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));



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

                    const volumeDistributionByFiveMin = calculateIntraDayVolumeDistribution(fiveMinCandleData)

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
                                    volumeDistributionMetrics: volumeDistributionByFiveMin,
                                    dateMorningMetricsLastCalculated: new Date()
                                }
                            }
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

        return {
            symbol: t.tickerSymbol, sector: t.sector, relevantCandleDate: t.relevantCandleDate,
            classification: t.patternClassification, anchor: anchorDate, cascadePattern: t?.cascadePattern
        }
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
                            // if (!stock.channelPattern.isPatternManuallyAdjusted)
                            //     channelPattern = projectAdaptiveChannelWithOptimizedCeiling(candleData, stock.anchor, 5, calculatedDailyValues.spyBetaValue)
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

async function updateOptionsContractInformation()
{

    const foundPlans = await EnterExitPlannedStock.find().select('tickerSymbol patternClassification')
    let tickerList = foundPlans.filter(t => t.patternClassification !== undefined).map(t => t.tickerSymbol)
    const fullWatchlistSymbols = await Stock.find({ Symbol: { $in: tickerList }, HasOptions: true });
    if (fullWatchlistSymbols.length === 0) return console.log(`No current plans need options update....`)


    console.log(`🌙 Initializing Throttled Options Pass for ${fullWatchlistSymbols.length} assets...`);
    const targetedBatches = chunkArray(fullWatchlistSymbols, 20);

    for (const activeBatch of targetedBatches)
    {
        try
        {
            const tickerActiveBatch = activeBatch.map((t) => t.Symbol)
            console.log(`🚀 Dispatching Throttled Sub-Batch Query for: [${tickerActiveBatch.join(', ')}]`);
            const snapShots = await alpaca.getSnapshots(tickerActiveBatch)
            const batchContractsResult = await fetchBatchWeeklyOptionsContracts(tickerActiveBatch, snapShots);
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (subBatchError)
        {
            console.error(`❌ Ingestion Failure inside active batch:`, subBatchError);
        }
    }
}

async function updateChannelAbsorbWindow()
{
    const foundPlans = await EnterExitPlannedStock.find({ patternClassification: 'channel' }).select('tickerSymbol channelPattern')
    if (foundPlans.length === 0) return
    console.log(`Initializing Channel Absorption Window Calculation`)

    const targetedBatches = chunkArray(foundPlans, 20)
    for (const activeBatch of targetedBatches)
    {
        try
        {
            let tickerList = activeBatch.map(t => t.tickerSymbol)
            const candleData = await alpaca.getMultiBarsV2(tickerList, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.MIN), start: subBusinessDays(new Date(), 6), })

            const bulkOperations = []
            for (const stock of activeBatch)
            {
                const oneMinCandleData = candleData.get(stock.tickerSymbol)

                if (oneMinCandleData && oneMinCandleData.length > 0)
                {
                    const batchAbsorbWindowResults = compileChannelHistoricalAbsorptionWindow(oneMinCandleData, stock)
                    console.log(stock.tickerSymbol)
                    console.log(batchAbsorbWindowResults)

                    //Construct efficient upsert bulk actions
                    bulkOperations.push({
                        updateOne: {
                            filter: { tickerSymbol: stock.tickerSymbol },
                            update: {
                                $set: {
                                    absorptionWindowMetrics: batchAbsorbWindowResults,
                                    dateAbsorptionWindowLastCalculated: new Date()
                                }
                            }
                        }
                    });
                }
            }

            // Execute all 50 database modifications in one network payload
            if (bulkOperations.length > 0)
            {
                const result = await EnterExitPlannedStock.bulkWrite(bulkOperations);
                console.log(`Successfully updated database for batch of channel absorption window. Modified: ${result.modifiedCount}`);
            }

            await new Promise(resolve => setTimeout(resolve, 3000));
        }



        catch (e)
        {
            console.log(e)
        }
    }
}

async function updateRetailVsInstitutional()
{
    const foundPlans = await EnterExitPlannedStock.find({ patternClassification: 'channel' }).select('tickerSymbol channelPattern')
    if (foundPlans.length === 0) return
    console.log(`Initializing Retail Vs Institutional trade calculation`)

    const targetedBatches = chunkArray(foundPlans, 20)
    const today = new Date()
    today.setHours(9, 30, 0, 0)
    for (const activeBatch of targetedBatches)
    {
        try
        {
            let tickerList = activeBatch.map(t => t.tickerSymbol)

            const [rawTradeData, rawCandleData] = await Promise.all([

                await alpaca.getMultiTradesV2(tickerList, { start: today }),
                await alpaca.getMultiBarsV2(tickerList, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.MIN), start: subBusinessDays(new Date(), 3), })
            ])










            const bulkOperations = []
            for (const stock of activeBatch)
            {
                const tradeData = rawTradeData.get(stock.tickerSymbol)
                const candleData = rawCandleData.get(stock.tickerSymbol)

                if (tradeData && tradeData.length > 0)
                {
                    const averageThreeDay = calculateThreeDayOneMinVolumeBaseline(candleData)
                    const batchAbsorbWindowResults = compileDualZoneAccumulationMetrics(tradeData, stock, averageThreeDay)

                    bulkOperations.push({
                        updateOne: {
                            filter: { tickerSymbol: stock.tickerSymbol },
                            update: {
                                $set: {
                                    "dailyTickerValues.baselineAvgOneMinVolume": averageThreeDay,
                                    retailVsInstitutionMetrics: batchAbsorbWindowResults,
                                    dateRvILastCalculated: new Date()
                                }
                            }
                        }
                    });
                }
            }

            // Execute all 50 database modifications in one network payload
            if (bulkOperations.length > 0)
            {
                const result = await EnterExitPlannedStock.bulkWrite(bulkOperations);
                console.log(`Successfully updated database for batch of retail vs institutional. Modified: ${result.modifiedCount}`);
            }

            await new Promise(resolve => setTimeout(resolve, 3000));
        }



        catch (e)
        {
            console.log(e)
        }
    }
}


async function updateOpenCrosses()
{
    const foundPlans = await EnterExitPlannedStock.find().select('tickerSymbol openCrossMetrics')


    let startDate = new Date()
    let endDate = new Date()
    if (isWeekend(startDate))
    {
        startDate = previousFriday(new Date())
        endDate = previousFriday(new Date())
    }
    startDate.setHours(9, 30, 0, 0)
    endDate.setHours(9, 31, 0, 0)

    // Split your massive list into safe 50-ticker sub-arrays
    const batches = chunkArray(foundPlans, 50);
    // Sequential loop through chunks to protect API rate limits
    for (const [index, batch] of batches.entries())
    {
        try
        {
            const onlyTickersFromBatch = foundPlans.map(t => t.tickerSymbol)
            const fiveMinCandles = await alpaca.getMultiTradesV2(onlyTickersFromBatch, { start: startDate, end: endDate })

            const bulkOperations = [];
            // Map over the chunk keys to perform calculations
            for (const stock of batch)
            {
                const fiveMinCandleData = fiveMinCandles.get(stock.tickerSymbol)
                if (!fiveMinCandleData || fiveMinCandleData.length === 0) continue

                const openCrossResults = reviewOpeningMinuteTape(fiveMinCandleData)

                let copyArray = [...stock.openCrossMetrics.previousOpenCross]

                const crossMetrics = {
                    date: startDate,
                    officialAuctionCrossPrice: openCrossResults.officialAuctionCrossPrice,
                    maximumBlockSizeFound: openCrossResults.maximumBlockSizeFound
                }


                const results = processMultiDayCrossTrend(crossMetrics, copyArray)

                bulkOperations.push({
                    updateOne: {
                        filter: { _id: stock._id },
                        update: {
                            $set: {
                                openCrossMetrics: {
                                    previousOpenCross: results.updatedHistoryLogs,
                                    todaysOpenCross: crossMetrics,
                                    sixDayBias: { ...results }
                                }
                            }
                        }
                    }
                });

            }

            if (bulkOperations.length > 0)
            {
                const result = await EnterExitPlannedStock.bulkWrite(bulkOperations);
                console.log(`Successfully updated database for batch ${index + 1} of Open Cross Metrics. Modified: ${result.upsertedCount + result.modifiedCount}`);
            }

            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (batchError)
        {
            console.error(`Error encountered processing batch ${index + 1}:`, batchError.message);
            // Script continues to next batch safely instead of crashing completely
        }
    }
}

async function updateHiddenTrades()
{
    const foundPlans = await EnterExitPlannedStock.find().select('tickerSymbol dateAdded relevantCandleDate plan patternClassification cascadePattern channelPattern continuationPattern')

    let oldestRequestDate = foundPlans[0].relevantCandleDate
    foundPlans.forEach(t => { if (isBefore(t.relevantCandleDate, oldestRequestDate)) oldestRequestDate = t.relevantCandleDate })
    const batches = chunkArray(foundPlans, 50);


    for (const [index, batch] of batches.entries())
    {
        try
        {
            const onlyTickersFromBatch = batch.map(t => t.tickerSymbol)
            const barsMap = await alpaca.getMultiBarsV2(onlyTickersFromBatch, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.DAY), start: oldestRequestDate })

            const bulkOperations = [];
            // Map over the chunk keys to perform calculations
            for (const stock of batch)
            {
                const candleData = barsMap.get(stock.tickerSymbol);
                if (candleData && candleData.length > 0)
                {

                    let entryPrice
                    let exitPrice
                    let stopLossPrice
                    let entryFloorPrice
                    if (stock.patternClassification === 'channel')
                    {
                        entryPrice = stock.channelPattern.entryStrikeBuffer
                        exitPrice = stock.channelPattern.channelTop
                        stopLossPrice = stock.plan.stopLossPrice
                        entryFloorPrice = stock.channelPattern.channelBottom
                    }

                    const entryStrikeBufferResults = processBackTests(entryPrice, exitPrice, stopLossPrice, stock, candleData)
                    // const discountPrices = processDeepDiscountPrices(stopLossPrice, entryFloorPrice, entryStrikeBufferResults.averages.lowestPatternValue, entryStrikeBufferResults.backTests)
                    // console.log(entryStrikeBufferResults.averages.lowestPatternValue, discountPrices)
                    const entryFloorResults = processBackTests(entryFloorPrice, exitPrice, stopLossPrice, stock, candleData)

                    //Construct efficient upsert bulk actions
                    bulkOperations.push({
                        updateOne: {
                            filter: { _id: stock._id },
                            update: {
                                $set: {
                                    relevantDateBackTests: {
                                        backTests: entryStrikeBufferResults.backTests,
                                        averages: entryStrikeBufferResults.averages
                                    },
                                    relevantDateBackTestsUsingFloor: {
                                        backTests: entryFloorResults.backTests,
                                        averages: entryFloorResults.averages
                                    }
                                }
                            }
                        }
                    });
                }




            }
            // // Execute all 50 database modifications in one network payload
            if (bulkOperations.length > 0)
            {
                console.log(bulkOperations.length)
                const result = await EnterExitPlannedStock.bulkWrite(bulkOperations);
                console.log(`Successfully updated database for batch ${index + 1} of Back Testing Values. Modified: ${result.modifiedCount}`);
            }

            await new Promise(resolve => setTimeout(resolve, 3000));

        } catch (batchError)
        {
            console.error(`Error encountered processing batch ${index + 1}:`, batchError.message);
            // Script continues to next batch safely instead of crashing completely
        }
    }


    // let totalPlanCount = 0
    // let tickerList = foundPlans.map(t =>
    // {
    //     totalPlanCount++

    //     return {
    //         symbol: t.tickerSymbol, classification: t.patternClassification, 
    //     }
    // })



}


function initScheduler()
{
    console.log('Scheduler is initialized')

    // updateMorningMetricsPreOpen()
    // updateOpenCrosses()
    // updateHiddenTrades()
    cron.schedule('20 9 * * *', () => { if (!isWeekend(new Date())) updateMorningMetricsPreOpen() })

    cron.schedule('25 9 * * *', () => { if (!isWeekend(new Date())) updateHighImportanceAndTradeMorningMetrics() })

    cron.schedule('32 9 * * *', () => { if (!isWeekend(new Date())) updateOpenCrosses() })

    cron.schedule('26 9 * * *', () => { if (!isWeekend(new Date())) updateOptionsContractInformation() })
    cron.schedule('05 13 * * *', () => { if (!isWeekend(new Date())) updateOptionsContractInformation() })


    cron.schedule('0 16 * * *', () => { if (!isWeekend(new Date())) updateChannelAbsorbWindow() })
    cron.schedule('10 16 * * *', () => { if (!isWeekend(new Date())) updateRetailVsInstitutional() })
    cron.schedule('30 16 * * *', () => { if (!isWeekend(new Date())) updateDailyValuesPostClose() })
    cron.schedule('30 16 * * *', () => { if (!isWeekend(new Date())) executeNightlyVolumeProfilePass() })

    cron.schedule('0 17 * * *', () => { if (!isWeekend(new Date())) updateHiddenTrades() })
}

module.exports = { initScheduler };