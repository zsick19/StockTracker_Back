/**
 * PRODUCTION COMPILER: compileDualZoneAccumulationMetrics
 * Splits historical trade logs into parallel Inside-Zone and Drift-Zone buckets
 * to isolate retail exhaustion drift from heavy institutional floor absorption [INDEX].
 * 
 * @param {Array} historicalRawTrades - Alpaca raw trade logs array: [{ p: 14.52, s: 2500 }]
 * @param {Object} channelConfig - Pre-save manual pricing markers { channelBottom, entryStrikeBuffer }
 * @returns {Object} Pristine, data-driven analytics package ready to hydrate MongoDB [INDEX]
 */
export function compileDualZoneAccumulationMetrics(historicalRawTrades, channelConfig, historicalOneMinBaseAvg)
{
    const supportFloor = channelConfig.channelPattern.channelBottom || 0;
    const entryBufferCeiling = channelConfig.channelPattern.entryStrikeBuffer || 0;


    // Define an institutional block dynamically as 5.0% of the stock's standard 1-minute volume bar.
    // For a liquid giant, this numbers climbs automatically; for thin equities, it shrinks safely.
    const dynamicBlockThreshold = Math.max(100, Math.round(historicalOneMinBaseAvg * 0.05));


    // Inside-Zone Accumulators (The Execution Target Box) [INDEX]
    let totalVolumeInsideZone = 0;
    let institutionalBlockVolumeInsideZone = 0;
    let totalTradesCountInsideZone = 0;

    // Drift-Zone Accumulators (Outside / Above the Box) [INDEX]
    let totalVolumeDriftZone = 0;
    let institutionalBlockVolumeDriftZone = 0;
    let totalTradesCountDriftZone = 0;

    if (!historicalRawTrades || historicalRawTrades.length === 0 || supportFloor === 0) { return { error: "Awaiting valid structural trade logs and manual price anchors." }; }

    // =========================================================================
    // 📊 DOUBLE-SIDED TAPE EVALUATION RUN LOOP
    // =========================================================================
    historicalRawTrades.forEach(trade =>
    {
        const tradePrice = trade.Price || trade.p || trade.price;
        const tradeSize = trade.Size || trade.s || trade.size || 0;

        if (tradeSize === 0) return;

        // Channel A: Inside the strict institutional support pocket [INDEX]
        if (tradePrice >= supportFloor && tradePrice <= entryBufferCeiling)
        {
            totalTradesCountInsideZone++;
            totalVolumeInsideZone += tradeSize;

            // Flag institutional blocks via 2,000+ share print sizes [INDEX]
            if (tradeSize >= dynamicBlockThreshold) { institutionalBlockVolumeInsideZone += tradeSize; }
        }
        // Channel B: Outside the box / Floating inside the upper drift corridor [INDEX]
        else if (tradePrice > entryBufferCeiling)
        {
            totalTradesCountDriftZone++;
            totalVolumeDriftZone += tradeSize;

            if (tradeSize >= dynamicBlockThreshold) { institutionalBlockVolumeDriftZone += tradeSize; }
        }
    });

    // =========================================================================
    // 📐 PRECISE FRACTIONAL PROPERTY RESOLUTION (NO DEFAULTS ALLOWED)
    // =========================================================================
    const floorBlockRatio = totalVolumeInsideZone > 0
        ? parseFloat(((institutionalBlockVolumeInsideZone / totalVolumeInsideZone) * 100).toFixed(1))
        : 0.0;

    const driftBlockRatio = totalVolumeDriftZone > 0
        ? parseFloat(((institutionalBlockVolumeDriftZone / totalVolumeDriftZone) * 100).toFixed(1))
        : 0.0;

    // Data-Driven Characterization Maps based on actual transaction weights
    const floorRegime = floorBlockRatio >= 65.0 ? "INSTITUTIONAL_SPONSORSHIP" : (totalVolumeInsideZone === 0 ? "UN_TESTED_FLOOR" : "RETAIL_CHURN_ZONE");
    const driftRegime = driftBlockRatio <= 25.0 ? "HOLLOW_RETAIL_DRIFT_CONFIRMED" : "INSTITUTIONAL_DISTRIBUTION_DRIVE";

    return {
        dynamicBlockThreshold,
        inZoneTradeCount: totalTradesCountInsideZone,
        inZoneLargeVsSmallRatio: floorBlockRatio,
        inZoneParticipantRegime: floorRegime,
        outOfZoneLargeVsSmallRatio: driftBlockRatio,
        outOfZoneParticipantRegime: driftRegime,
    };
}


// /**
//  * PRODUCTION COMPILER: compileDualZoneDynamicAccumulationMetrics
//  * Dynamically calibrates an institutional block threshold per asset based on its historical
//  * 1-minute volume baseline, completely eliminating hardcoded share limits [INDEX].
//  *
//  * @param {Array} historicalRawTrades - Alpaca raw trade logs array: [{ p: 14.52, s: 2500 }]
//  * @param {Object} planEntity - Core plan document from MongoDB cache holding your volume baseline keys
//  * @returns {Object} Pristine, data-driven analytics package ready to hydrate MongoDB [INDEX]
//  */
// export function compileDualZoneDynamicAccumulationMetrics(historicalRawTrades, planEntity, historicalOneMinBaseAvg)
// {
//     const channelConfig = planEntity.channelPattern || {};
//     const supportFloor = channelConfig.channelBottom || 0;
//     const entryBufferCeiling = channelConfig.entryStrikeBuffer || 0;

//     if (!historicalRawTrades || historicalRawTrades.length === 0 || supportFloor === 0)
//     {
//         return { error: "Awaiting valid structural trade logs and manual price anchors." };
//     }

//     // =========================================================================
//     // 📐 THE DYNAMIC INSTITUTIONAL COEFFICIENT SENTRY [INDEX]
//     // =========================================================================
//     // Pull the pre-compiled 3-day 1-minute baseline volume average calculated on cold-boot [INDEX]

//     // Define an institutional block dynamically as 5.0% of the stock's standard 1-minute volume bar.
//     // For a liquid giant, this numbers climbs automatically; for thin equities, it shrinks safely.
//     const dynamicBlockThreshold = Math.max(100, Math.round(historicalOneMinBaseAvg * 0.05));

//     // Inside-Zone Accumulators (The Target Buy Box) [INDEX]
//     let totalVolumeInsideZone = 0;
//     let institutionalBlockVolumeInsideZone = 0;
//     let totalTradesCountInsideZone = 0;

//     // Drift-Zone Accumulators (Outside / Above the Box) [INDEX]
//     let totalVolumeDriftZone = 0;
//     let institutionalBlockVolumeDriftZone = 0;
//     let totalTradesCountDriftZone = 0;

//     // =========================================================================
//     // 📊 DOUBLE-SIDED TAPE EVALUATION RUN LOOP
//     // =========================================================================
//     historicalRawTrades.forEach(trade =>
//     {
//         const tradePrice = trade.p || trade.price;
//         const tradeSize = trade.s || trade.size || 0;

//         if (tradeSize === 0) return;

//         // Channel A: Inside the strict institutional support pocket [INDEX]
//         if (tradePrice >= supportFloor && tradePrice <= entryBufferCeiling)
//         {
//             totalTradesCountInsideZone++;
//             totalVolumeInsideZone += tradeSize;

//             // Apply the customized dynamic share velocity filter [INDEX]
//             if (tradeSize >= dynamicBlockThreshold)
//             {
//                 institutionalBlockVolumeInsideZone += tradeSize;
//             }
//         }
//         // Channel B: Outside the box / Floating inside the upper drift corridor [INDEX]
//         else if (tradePrice > entryBufferCeiling)
//         {
//             totalTradesCountDriftZone++;
//             totalVolumeDriftZone += tradeSize;

//             if (tradeSize >= dynamicBlockThreshold)
//             {
//                 institutionalBlockVolumeDriftZone += tradeSize;
//             }
//         }
//     });

//     // =========================================================================
//     // 📐 PRECISE FRACTIONAL PROPERTY RESOLUTION
//     // =========================================================================
//     const floorBlockRatio = totalVolumeInsideZone > 0
//         ? parseFloat(((institutionalBlockVolumeInsideZone / totalVolumeInsideZone) * 100).toFixed(1))
//         : 0.0;

//     const driftBlockRatio = totalVolumeDriftZone > 0
//         ? parseFloat(((institutionalBlockVolumeDriftZone / totalVolumeDriftZone) * 100).toFixed(1))
//         : 0.0;

//     return {
//         // SAVING DYNAMIC CALIBRATION METADATA TO TRACK INTELLIGENCE
//         computedBlockThresholdShares: dynamicBlockThreshold,

//         // INSIDE THE BOX STATS [INDEX]
//         floorBlockVolumeRatio: floorBlockRatio,
//         totalInsideZoneTrades: totalTradesCountInsideZone,
//         floorParticipantRegime: floorBlockRatio >= 65.0 ? "INSTITUTIONAL_SPONSORSHIP" : (totalVolumeInsideZone === 0 ? "UN_TESTED_FLOOR" : "RETAIL_CHURN_ZONE"),

//         // OUTSIDE THE BOX STATS (THE DRIFT VELOCITY) [INDEX]
//         driftBlockVolumeRatio: driftBlockRatio,
//         totalDriftZoneTrades: totalTradesCountDriftZone,
//         driftParticipantRegime: driftBlockRatio <= 25.0 ? "HOLLOW_RETAIL_DRIFT_CONFIRMED" : "INSTITUTIONAL_DISTRIBUTION_DRIVE",

//         lastTapeAnalysisDate: new Date()
//     };
// }
