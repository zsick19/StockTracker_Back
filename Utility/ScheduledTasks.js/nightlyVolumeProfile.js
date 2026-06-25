import fs from 'fs';
import csv from 'csv-parser';
import EnterExitPlannedStock from '../../models/EnterExitPlannedStock';

/**
 * Nightly Collection Volume Profiler.
 * Computes 3-Tier Resistance AND 3-Tier Support Shelves headlessly post-market.
 */
export async function executeNightlyVolumeProfilePass()
{
    console.log("🌙 Nightly Data Pass Active: Compiling horizontal Volume Profile Shelves...");

    try
    {
        const activePlans = await EnterExitPlannedStock.find();
        const bulkOperations = [];

        for (const plan of activePlans)
        {
            const targetFloorLine = plan.channelPattern?.channelBottom ||
                plan.cascadePattern?.projection?.priceFloor || 0;
            const cleanHistory = plan.historicalCandles || [];

            if (targetFloorLine === 0 || cleanHistory.length === 0) continue;

            const isPennyStock = plan.channelPattern?.channelType === "SUB_ENGINE_PENNY_STOCK_SCALP";
            const bucketSize = isPennyStock ? 0.01 : 0.25; // 1-Cent for pennies, 25-Cent for large caps

            const overheadBuckets = {};
            const underlyingBuckets = {};
            let totalOverheadVol = 0;
            let totalUnderlyingVol = 0;

            // 1. HORIZONTAL PRICE SPLIT SEPARATORS
            cleanHistory.forEach(candle =>
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
                    if (volPct >= (isPennyStock ? 20.0 : 25.0)) friction = "HIGH_CRITICAL_CLIFF";
                    else if (volPct >= (isPennyStock ? 10.0 : 12.0)) friction = "MODERATE_TRAFFIC_NODE";

                    return {
                        priceLevel: parseFloat(priceStr),
                        volumePct: parseFloat(volPct.toFixed(1)),
                        frictionRating: friction
                    };
                }).sort((a, b) => b.volumePct - a.volumePct).slice(0, 3);
            };

            const parsedResistanceShelves = extractTopThreeShelves(overheadBuckets, totalOverheadVol);
            const parsedSupportShelves = extractTopThreeShelves(underlyingBuckets, totalUnderlyingVol);

            // 3. ATTACH PACKETS TO ATOMIC BULK BUFFER
            bulkOperations.push({
                updateOne: {
                    filter: { _id: plan._id },
                    update: {
                        $set: {
                            "staticPreCompiledIndicators.overheadResistanceShelves": parsedResistanceShelves,
                            "staticPreCompiledIndicators.underlyingSupportShelves": parsedSupportShelves,
                            "dateVolumeProfileCalculated": new Date()
                        }
                    }
                }
            });
        }

        if (bulkOperations.length > 0)
        {
            const bulkResult = await TradingPlanModel.bulkWrite(bulkOperations);
            console.log(`✨ Nightly Profile Sync Complete: Hydrated ${bulkResult.modifiedCount} database documents with 3-tier boundary structures.`);
        }

    } catch (error)
    {
        console.error("❌ Nightly Volume Profile pass failed:", error);
    }
}
