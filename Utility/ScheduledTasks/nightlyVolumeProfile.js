const { subBusinessDays } = require('date-fns/subBusinessDays');
const EnterExitPlannedStock = require('../../models/EnterExitPlannedStock')
const { filterRegularSessionCandles } = require('./regularHourCandleFilter')
const Alpaca = require('@alpacahq/alpaca-trade-api');
const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });

/**
 * Nightly Collection Volume Profiler.
 * Computes 3-Tier Resistance AND 3-Tier Support Shelves headless post-market.
 */
async function executeNightlyVolumeProfilePass()
{
    console.log("🌙 Nightly Data Pass Active: Compiling horizontal Volume Profile Shelves...");
    try
    {
        const foundPlans = await EnterExitPlannedStock.find()
            .select('_id tickerSymbol patternClassification maintainLiveCandles cascadePattern channelPattern continuationPattern')

        const threeDayOneMinPlans = []
        const tenDayFiveMinPlans = []

        let totalPlanCount = 0
        foundPlans.forEach((t) =>
        {
            if (t?.patternClassification !== undefined)
            {
                totalPlanCount++

                let patternConfig
                if (t.patternClassification === 'channel') { patternConfig = t.channelPattern }
                else if (t.patternClassification === 'cascade') patternConfig = t.cascadePattern
                else if (t.patternClassification === 'continuation') { patternConfig = t.continuationPattern }

                if (t.maintainLiveCandles) { threeDayOneMinPlans.push({ _id: t._id, symbol: t.tickerSymbol, patternClassification: t.patternClassification, patternConfig }) }
                else { tenDayFiveMinPlans.push({ _id: t._id, symbol: t.tickerSymbol, patternClassification: t.patternClassification, patternConfig }) }
            }
        })


        function chunkArray(array, size)
        {
            const result = [];
            for (let i = 0; i < array.length; i += size) { result.push(array.slice(i, i + size)) }
            return result;
        }
        const oneMinBatches = chunkArray(threeDayOneMinPlans, 50);
        const fiveMinBatches = chunkArray(tenDayFiveMinPlans, 50);

        for (const [index, batch] of oneMinBatches.entries())
        {
            try
            {
                const onlyTickersFromBatch = threeDayOneMinPlans.map((t) => t.symbol)

                const minuteCandles = await alpaca.getMultiBarsV2(onlyTickersFromBatch, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.MIN), start: subBusinessDays(new Date(), 3), })

                const bulkOperations = []
                for (const plan of batch)
                {
                    const rawCandleData = minuteCandles.get(plan.symbol)
                    if (!rawCandleData || rawCandleData.length === 0) continue
                    const cleanCandleData = filterRegularSessionCandles(rawCandleData)

                    const targetFloorLine = plan.patternConfig?.channelBottom || 0;
                    const bucketSize = 0.01

                    const overheadBuckets = {};
                    const underlyingBuckets = {};
                    let totalOverheadVol = 0;
                    let totalUnderlyingVol = 0;

                    // 1. HORIZONTAL PRICE SPLIT SEPARATORS
                    cleanCandleData.forEach(candle =>
                    {
                        const bucketPrice = Math.floor(candle.ClosePrice / bucketSize) * bucketSize;
                        const cleanKey = bucketPrice.toFixed(2);

                        if (candle.ClosePrice > targetFloorLine)
                        {
                            // Overhead Resistance Track
                            overheadBuckets[cleanKey] = (overheadBuckets[cleanKey] || 0) + candle.Volume;
                            totalOverheadVol += candle.Volume;
                        } else if (candle.ClosePrice < targetFloorLine)
                        {
                            // Underlying Support Track
                            underlyingBuckets[cleanKey] = (underlyingBuckets[cleanKey] || 0) + candle.Volume;
                            totalUnderlyingVol += candle.Volume;
                        }
                    });

                    // 2. HELPER TO EXTRACT AND TYPE TOP 3 SHELVES
                    const extractTopThreeShelves = (bucketsMap, totalVol) =>
                    {
                        if (totalVol === 0) return [];
                        return Object.keys(bucketsMap).map(priceStr =>
                        {
                            const volPct = (bucketsMap[priceStr] / totalVol) * 100;

                            let friction = "MILD";
                            if (volPct >= 20) friction = "HIGH_CRITICAL_CLIFF";
                            else if (volPct >= 10) friction = "MODERATE_TRAFFIC_NODE";

                            return {
                                priceLevel: parseFloat(priceStr),
                                volumePct: parseFloat(volPct.toFixed(1)),
                                frictionRating: friction
                            };
                        }).sort((a, b) => b.volumePct - a.volumePct).slice(0, 3);
                    };

                    const parsedResistanceShelves = extractTopThreeShelves(overheadBuckets, totalOverheadVol);
                    const parsedSupportShelves = extractTopThreeShelves(underlyingBuckets, totalUnderlyingVol);


                    bulkOperations.push({
                        updateOne: {
                            filter: { _id: plan._id },
                            update: {
                                $set: {
                                    "volumeProfileMetrics.overHeadResistance": parsedResistanceShelves,
                                    "volumeProfileMetrics.underlyingSupport": parsedSupportShelves,
                                    "dateVolumeProfileLastCalculated": new Date()
                                }
                            }
                        }
                    });
                }

                if (bulkOperations.length > 0)
                {
                    const bulkResult = await EnterExitPlannedStock.bulkWrite(bulkOperations);
                    console.log(`✨ Nightly Profile Sync Complete: Hydrated ${bulkResult.modifiedCount} database documents with 3-tier boundary structures.`);
                }

                await new Promise(resolve => setTimeout(resolve, 3000))

            } catch (error)
            {
                console.error("❌ Nightly Volume Profile pass for one min stocks failed:", error);
            }
        }



        for (const [index, batch] of fiveMinBatches.entries())
        {

            try
            {
                const onlyTickersFromBatch = tenDayFiveMinPlans.map((t) => t.symbol)
                const minuteCandles = await alpaca.getMultiBarsV2(onlyTickersFromBatch, { timeframe: alpaca.newTimeframe(5, alpaca.timeframeUnit.MIN), start: subBusinessDays(new Date(), 10), })

                const bulkOperations = []
                for (const plan of batch)
                {
                    const rawCandleData = minuteCandles.get(plan.symbol)
                    if (!rawCandleData || rawCandleData.length === 0) continue
                    const cleanCandleData = filterRegularSessionCandles(rawCandleData)


                    const targetFloorLine = plan.patternConfig?.channelBottom || plan.patternConfig?.projection?.priceFloor || 0;
                    const bucketSize = 0.25

                    const overheadBuckets = {};
                    const underlyingBuckets = {};
                    let totalOverheadVol = 0;
                    let totalUnderlyingVol = 0;
                    // 1. HORIZONTAL PRICE SPLIT SEPARATORS
                    cleanCandleData.forEach(candle =>
                    {
                        const bucketPrice = Math.floor(candle.ClosePrice / bucketSize) * bucketSize;
                        const cleanKey = bucketPrice.toFixed(2);

                        if (candle.ClosePrice > targetFloorLine)
                        {
                            // Overhead Resistance Track
                            overheadBuckets[cleanKey] = (overheadBuckets[cleanKey] || 0) + candle.Volume;
                            totalOverheadVol += candle.Volume;
                        } else if (candle.ClosePrice < targetFloorLine)
                        {
                            // Underlying Support Track
                            underlyingBuckets[cleanKey] = (underlyingBuckets[cleanKey] || 0) + candle.Volume;
                            totalUnderlyingVol += candle.Volume;
                        }
                    });

                    // 2. HELPER TO EXTRACT AND TYPE TOP 3 SHELVES
                    const extractTopThreeShelves = (bucketsMap, totalVol) =>
                    {
                        if (totalVol === 0) return [];
                        return Object.keys(bucketsMap).map(priceStr =>
                        {
                            const volPct = (bucketsMap[priceStr] / totalVol) * 100;

                            let friction = "MILD";
                            if (volPct >= 25.0) friction = "HIGH_CRITICAL_CLIFF";
                            else if (volPct >= 12.0) friction = "MODERATE_TRAFFIC_NODE";

                            return {
                                priceLevel: parseFloat(priceStr),
                                volumePct: parseFloat(volPct.toFixed(1)),
                                frictionRating: friction
                            };
                        }).sort((a, b) => b.volumePct - a.volumePct).slice(0, 3);
                    };


                    const parsedResistanceShelves = extractTopThreeShelves(overheadBuckets, totalOverheadVol);
                    const parsedSupportShelves = extractTopThreeShelves(underlyingBuckets, totalUnderlyingVol);


                    bulkOperations.push({
                        updateOne: {
                            filter: { _id: plan._id },
                            update: {
                                $set: {
                                    "volumeProfileMetrics.overHeadResistance": parsedResistanceShelves,
                                    "volumeProfileMetrics.underlyingSupport": parsedSupportShelves,
                                    "dateVolumeProfileLastCalculated": new Date()
                                }
                            },
                        }
                    });
                }

                if (bulkOperations.length > 0)
                {
                    const bulkResult = await EnterExitPlannedStock.bulkWrite(bulkOperations);
                    console.log(`✨ Nightly Profile Sync For 5 Min Plans Complete: Hydrated ${bulkResult.modifiedCount} database documents.`);
                }

                await new Promise(resolve => setTimeout(resolve, 2000))

            } catch (error)
            {
                console.error("❌ Nightly Volume Profile pass for five min stocks failed:", error);
            }
        }


    }
    catch (e)
    {
        console.log(e)
        console.log(`Error Processing nightly 3-Tier Resistance and 3-Tier Support Shelves`)
    }
}

module.exports = { executeNightlyVolumeProfilePass }





















//         const bulkOperations = [];

//         for (const plan of activePlans)
//         {
//             const targetFloorLine = plan.channelPattern?.channelBottom ||
//                 plan.cascadePattern?.projection?.priceFloor || 0;
//             const cleanHistory = plan.historicalCandles || [];

//             if (targetFloorLine === 0 || cleanHistory.length === 0) continue;

//             const isPennyStock = plan.channelPattern?.channelType === "SUB_ENGINE_PENNY_STOCK_SCALP";
//             const bucketSize = isPennyStock ? 0.01 : 0.25; // 1-Cent for pennies, 25-Cent for large caps

//             const overheadBuckets = {};
//             const underlyingBuckets = {};
//             let totalOverheadVol = 0;
//             let totalUnderlyingVol = 0;

//             // 1. HORIZONTAL PRICE SPLIT SEPARATORS
//             cleanHistory.forEach(candle =>
//             {
//                 const bucketPrice = Math.floor(candle.ClosePrice / bucketSize) * bucketSize;
//                 const cleanKey = bucketPrice.toFixed(2);

//                 if (candle.ClosePrice > targetFloorLine)
//                 {
//                     // Overhead Resistance Track
//                     overheadBuckets[cleanKey] = (overheadBuckets[cleanKey] || 0) + candle.Volume;
//                     totalOverheadVol += candle.Volume;
//                 } else if (candle.ClosePrice < targetFloorLine)
//                 {
//                     // Underlying Support Track
//                     underlyingBuckets[cleanKey] = (underlyingBuckets[cleanKey] || 0) + candle.Volume;
//                     totalUnderlyingVol += candle.Volume;
//                 }
//             });

//             // 2. HELPER TO EXTRACT AND TYPE TOP 3 SHELVES
//             const extractTopThreeShelves = (bucketsMap, totalVol) =>
//             {
//                 if (totalVol === 0) return [];
//                 return Object.keys(bucketsMap).map(priceStr =>
//                 {
//                     const volPct = (bucketsMap[priceStr] / totalVol) * 100;

//                     let friction = "MILD";
//                     if (volPct >= (isPennyStock ? 20.0 : 25.0)) friction = "HIGH_CRITICAL_CLIFF";
//                     else if (volPct >= (isPennyStock ? 10.0 : 12.0)) friction = "MODERATE_TRAFFIC_NODE";

//                     return {
//                         priceLevel: parseFloat(priceStr),
//                         volumePct: parseFloat(volPct.toFixed(1)),
//                         frictionRating: friction
//                     };
//                 }).sort((a, b) => b.volumePct - a.volumePct).slice(0, 3);
//             };

//             const parsedResistanceShelves = extractTopThreeShelves(overheadBuckets, totalOverheadVol);
//             const parsedSupportShelves = extractTopThreeShelves(underlyingBuckets, totalUnderlyingVol);

//             // 3. ATTACH PACKETS TO ATOMIC BULK BUFFER
//             bulkOperations.push({
//                 updateOne: {
//                     filter: { _id: plan._id },
//                     update: {
//                         $set: {
//                             "staticPreCompiledIndicators.overheadResistanceShelves": parsedResistanceShelves,
//                             "staticPreCompiledIndicators.underlyingSupportShelves": parsedSupportShelves,
//                             "dateVolumeProfileCalculated": new Date()
//                         }
//                     },
//                     upsert: true
//                 }
//             });
//         }

//         if (bulkOperations.length > 0)
//         {
//             const bulkResult = await EnterExitPlannedStock.bulkWrite(bulkOperations);
//             console.log(`✨ Nightly Profile Sync Complete: Hydrated ${bulkResult.modifiedCount} database documents with 3-tier boundary structures.`);
//         }

//         await new Promise(resolve => setTimeout(resolve, 3000))

//     } catch (error)
//     {
//         console.error("❌ Nightly Volume Profile pass for one min stocks failed:", error);
//     }
// }
