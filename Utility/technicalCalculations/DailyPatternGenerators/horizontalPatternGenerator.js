/**
 * Master Adaptive, Penny-Aware & Density-Optimized Channel Engine.
 * Automatically classifies asset types, applies risk tuning knobs,
 * and profiles daily high frequencies to extract the most reliable target ceiling.
 * 
 * @param {Array} dailyCandles - Complete daily candlestick historical cache from your store
 * @param {string} patternStartDate - The user-selected fixed ISO/Date string anchor
 * @param {number} pennyStockThreshold - Maximum price boundary for penny classification (Default: 5.00)
 * @param {number} ceilingBinSizeCents - Horizontal increment size for profiling highs (Default: 0.10)
 */
function projectAdaptiveChannelWithOptimizedCeiling(dailyCandles, patternStartDate, pennyStockThreshold = 5.00, ceilingBinSizeCents = 0.10)
{
    if (!dailyCandles || dailyCandles.length < 5) { return { success: false, error: "Insufficient daily candlestick dataset provided." }; }

    const targetTimestampFloor = new Date(patternStartDate).getTime();
    const localizedWorkspace = dailyCandles.filter(c => new Date(c.Timestamp).getTime() >= targetTimestampFloor)
        .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

    const n = localizedWorkspace.length;
    if (n < 3) return { success: false, error: "Insufficient trading sessions elapsed since pattern start date." };

    // 1. Linear Regression and Standard Error Baselines
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    localizedWorkspace.forEach((candle, idx) =>
    {
        sumX += idx; sumY += candle.ClosePrice; sumXY += (idx * candle.ClosePrice); sumX2 += (idx * idx);
    });
    const slope = ((n * sumXY) - (sumX * sumY)) / ((n * sumX2) - (sumX * sumX));
    const intercept = (sumY - (slope * sumX)) / n;

    let totalSquaredError = 0;
    localizedWorkspace.forEach((candle, idx) =>
    {
        const predictedPrice = (slope * idx) + intercept;
        totalSquaredError += Math.pow(candle.ClosePrice - predictedPrice, 2);
    });
    const standardError = Math.sqrt(totalSquaredError / (n - 2));

    const minRangeLow = Math.min(...localizedWorkspace.map(c => c.LowPrice));
    const calculatedChannelBottom = Math.max(minRangeLow, intercept - (standardError * 2));
    const avgDailyTrueRange = localizedWorkspace.reduce((sum, c) => sum + (c.HighPrice - c.LowPrice), 0) / n;
    const liveReferencePrice = localizedWorkspace[n - 1].ClosePrice;

    // =========================================================================
    // CRITICAL FIX: HIGH-FREQUENCY CEILING PROFILE SCANNER (MODE ISOLATION)
    // =========================================================================
    // Instead of taking the absolute max High, we map a histogram of all daily highs 
    // to find where the stock mathematically clusters and drops from the most.
    const highPriceHistogram = {};
    localizedWorkspace.forEach(candle =>
    {
        // Chunk each daily High into standard horizontal pricing bins (e.g., $45.10, $45.20)
        const binKey = Math.floor(candle.HighPrice / ceilingBinSizeCents) * ceilingBinSizeCents;
        highPriceHistogram[binKey] = (highPriceHistogram[binKey] || 0) + 1;
    });

    let highestClusterCount = 0;
    let optimizedCeilingClusterPrice = intercept + (standardError * 2); // Default baseline fallback

    Object.keys(highPriceHistogram).forEach(binPrice =>
    {
        const structuralFrequencyCount = highPriceHistogram[binPrice];
        // If a lower, high-density cluster has been struck more frequently than the outlier peaks,
        // we isolate it as our optimized target line.
        if (structuralFrequencyCount > highestClusterCount)
        {
            highestClusterCount = structuralFrequencyCount;
            optimizedCeilingClusterPrice = parseFloat(binPrice);
        }
    });

    // Enforce a strict boundary ceiling caps so a massive low-range cluster doesn't place the ceiling below the floor
    const calculatedChannelTop = Math.max(optimizedCeilingClusterPrice, intercept + (standardError * 0.5));
    const channelHeightPrice = calculatedChannelTop - calculatedChannelBottom;

    // =========================================================================
    // PHASE 2: ADAPTIVE MULTI-ENVIRONMENT INGESTION DISPATCHER
    // =========================================================================
    let finalPayload = {};
    let executionHoldRule
    if (liveReferencePrice <= pennyStockThreshold)
    {
        // Sub-Engine A: Penny Stock Parameters
        const pennyStrikeZoneCeiling = calculatedChannelBottom + (channelHeightPrice * 0.05);
        finalPayload = {
            channelType: "PENNY_STOCK_SCALP",
            channelBottom: parseFloat(calculatedChannelBottom.toFixed(2)),
            channelTop: parseFloat(calculatedChannelTop.toFixed(2)), // Uses optimized high-probability ceiling
            channelHeight: parseFloat(channelHeightPrice.toFixed(2)),
            entryStrikeBuffer: parseFloat(pennyStrikeZoneCeiling.toFixed(2)),
            stopLossBufferMultiplier: 2.5,
            requiredVolumeMultiplier: 3.5,
        };
        executionHoldRule = "🚨 PENNY STOCK SCALP MODE: Highly volatile liquidity environment. Requires 3.5x Volume Expansion to confirm floor. Scalp intraday only."
    } else
    {
        // Standard Equities: Fallback to regular dual-horizon tracking
        const isChannelIntradayTight = channelHeightPrice <= (avgDailyTrueRange * 1.5);

        if (isChannelIntradayTight)
        {
            const tightStrikeZoneCeiling = calculatedChannelBottom + (channelHeightPrice * 0.08);
            finalPayload = {
                channelType: "INTRADAY_TIGHT",
                channelBottom: parseFloat(calculatedChannelBottom.toFixed(2)),
                channelTop: parseFloat(calculatedChannelTop.toFixed(2)), // Uses optimized high-probability ceiling
                channelHeight: parseFloat(channelHeightPrice.toFixed(2)),
                entryStrikeBuffer: parseFloat(tightStrikeZoneCeiling.toFixed(2)),
                stopLossBufferMultiplier: 1.0,
                requiredVolumeMultiplier: 1.5,
            };
            executionHoldRule = "⚠️ FAST INTRADAY SCALP WINDOW: Take profits same-day/next-day at the ceiling. Do not swing overnight."
        } else
        {
            const spacedStrikeZoneCeiling = calculatedChannelBottom + (channelHeightPrice * 0.18);
            finalPayload = {
                channelType: "MULTIDAY_SPACED",
                channelBottom: parseFloat(calculatedChannelBottom.toFixed(2)),
                channelTop: parseFloat(calculatedChannelTop.toFixed(2)), // Uses optimized high-probability ceiling
                channelHeight: parseFloat(channelHeightPrice.toFixed(2)),
                entryStrikeBuffer: parseFloat(spacedStrikeZoneCeiling.toFixed(2)),
                stopLossBufferMultiplier: 1.0,
                requiredVolumeMultiplier: 1.5,
            };
            executionHoldRule = "✅ MULTI-DAY SWING MODE: Target is wide. Hold position comfortably for a 2-3 day rotation back to the ceiling."
        }
    }

    return {
        ...finalPayload,
        anchorDate: patternStartDate,
    };
}


module.exports = { projectAdaptiveChannelWithOptimizedCeiling }