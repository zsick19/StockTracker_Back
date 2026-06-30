/**
 * PRODUCTION COMPILER: compileDualZoneAccumulationMetrics
 * Splits historical trade logs into parallel Inside-Zone and Drift-Zone buckets
 * to isolate retail exhaustion drift from heavy institutional floor absorption [INDEX].
 * 
 * @param {Array} historicalRawTrades - Alpaca raw trade logs array: [{ p: 14.52, s: 2500 }]
 * @param {Object} channelConfig - Pre-save manual pricing markers { channelBottom, entryStrikeBuffer }
 * @returns {Object} Pristine, data-driven analytics package ready to hydrate MongoDB [INDEX]
 */
export function compileDualZoneAccumulationMetrics(historicalRawTrades, channelConfig)
{
    const supportFloor = channelConfig.channelBottom || 0;
    const entryBufferCeiling = channelConfig.entryStrikeBuffer || 0;

    // Inside-Zone Accumulators (The Execution Target Box) [INDEX]
    let totalVolumeInsideZone = 0;
    let institutionalBlockVolumeInsideZone = 0;
    let totalTradesCountInsideZone = 0;

    // Drift-Zone Accumulators (Outside / Above the Box) [INDEX]
    let totalVolumeDriftZone = 0;
    let institutionalBlockVolumeDriftZone = 0;
    let totalTradesCountDriftZone = 0;

    if (!historicalRawTrades || historicalRawTrades.length === 0 || supportFloor === 0)
    {
        return { error: "Awaiting valid structural trade logs and manual price anchors." };
    }

    // =========================================================================
    // 📊 DOUBLE-SIDED TAPE EVALUATION RUN LOOP
    // =========================================================================
    historicalRawTrades.forEach(trade =>
    {
        const tradePrice = trade.p || trade.price;
        const tradeSize = trade.s || trade.size || 0;

        if (tradeSize === 0) return;

        // Channel A: Inside the strict institutional support pocket [INDEX]
        if (tradePrice >= supportFloor && tradePrice <= entryBufferCeiling)
        {
            totalTradesCountInsideZone++;
            totalVolumeInsideZone += tradeSize;

            // Flag institutional blocks via 2,000+ share print sizes [INDEX]
            if (tradeSize >= 2000)
            {
                institutionalBlockVolumeInsideZone += tradeSize;
            }
        }
        // Channel B: Outside the box / Floating inside the upper drift corridor [INDEX]
        else if (tradePrice > entryBufferCeiling)
        {
            totalTradesCountDriftZone++;
            totalVolumeDriftZone += tradeSize;

            if (tradeSize >= 2000)
            {
                institutionalBlockVolumeDriftZone += tradeSize;
            }
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
        // INSIDE THE BOX STATS
        floorBlockVolumeRatio: floorBlockRatio,
        totalInsideZoneTrades: totalTradesCountInsideZone,
        floorParticipantRegime: floorRegime,

        // OUTSIDE THE BOX STATS (THE DRIFT VELOCITY) [INDEX]
        driftBlockVolumeRatio: driftBlockRatio,
        totalDriftZoneTrades: totalTradesCountDriftZone,
        driftParticipantRegime: driftRegime,

        // Central verification metadata
        lastTapeAnalysisDate: new Date()
    };
}
