/**
 * PRODUCTION COMPILER: processMultiDayCrossTrend
 * Ingests today's opening cross and merges it with past historical arrays
 * to compute noise-free least-squares trend lines and velocity deceleration deltas [INDEX].
 * 
 * @param {Object} todaysCrossObj - Today's 09:31 AM fresh payload object: { date, officialAuctionCrossPrice, maximumBlockSizeFound }
 * @param {Array} databaseHistoricalLogs - Existing `historicalAuctionCrossLogs` array pulled directly from MongoDB (5 points) [INDEX]
 * @returns {Object} Structured data package ready to patch straight to your Mongoose document collections
 */
function processMultiDayCrossTrend(todaysCrossObj, databaseHistoricalLogs)
{
    // 1. CONSTRUCT A CLEAN CHRONOLOGICAL 6-POINT WORKSPACE ARRAY
    console.log(databaseHistoricalLogs)
    const existingLogsCopy = Array.isArray(databaseHistoricalLogs) ? [...databaseHistoricalLogs] : [];

    // Ensure historical data is sorted oldest-to-newest before appending today's data [INDEX]
    existingLogsCopy.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Append today's fresh incoming object to the end of the array timeline
    const combinedTimeline = [...existingLogsCopy, {
        date: todaysCrossObj.date,
        officialAuctionCrossPrice: parseFloat(todaysCrossObj.officialAuctionCrossPrice),
        maximumBlockSizeFound: parseInt(todaysCrossObj.maximumBlockSizeFound, 10)
    }];

    // Limit array pool length to retain strictly the most recent 6 trading sessions to prevent data bloat [INDEX]
    if (combinedTimeline.length > 6)
    {
        combinedTimeline.shift(); // Remove the oldest historical point
    }

    const totalAvailablePoints = combinedTimeline.length;

    // Hard fallback framework schema if history lacks depth early in testing stages
    const defaultStrategyFallback = {
        updatedHistoryLogs: combinedTimeline,
        auctionTrendBias: "NEUTRAL",
        auctionSlopeCoefficient: 0.0,
        auctionVelocityDelta: 0.0,
        auctionDecelerationAlert: false
    };

    if (totalAvailablePoints < 3) return defaultStrategyFallback;

    // Extract raw price numbers for matrix calculations
    const priceSeries = combinedTimeline.map(item => item.officialAuctionCrossPrice);

    // =========================================================================
    // 📐 PASS 1: LEAST-SQUARES LINEAR REGRESSION SLOPE (1ST DERIVATIVE) [INDEX]
    // =========================================================================
    let sumX = 0; let sumY = 0; let sumXY = 0; let sumXX = 0;
    for (let x = 0; x < totalAvailablePoints; x++)
    {
        const y = priceSeries[x];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
    }
    const calculatedFirstDerivativeSlope = (totalAvailablePoints * sumXY - sumX * sumY) / (totalAvailablePoints * sumXX - sumX * sumX);

    // =========================================================================
    // 📐 PASS 2: FINITE DIFFERENCE COMPRESSION (2ND DERIVATIVE VELOCITY) [INDEX]
    // =========================================================================
    // Calculate the absolute distance intervals separating consecutive auction cross sessions
    const intervalDeltas = [];
    for (let i = 1; i < totalAvailablePoints; i++)
    {
        intervalDeltas.push(Math.abs(priceSeries[i] - priceSeries[i - 1]));
    }

    let dynamicRateOfChangeDeceleration = 0.0;
    let isDeceleratingCompressionActive = false;

    if (intervalDeltas.length >= 2)
    {
        const standardLastIndex = intervalDeltas.length - 1;
        const currentPaceDelta = intervalDeltas[standardLastIndex];
        const priorPaceDelta = intervalDeltas[standardLastIndex - 1];

        // Second Derivative calculation: Rate of change of the internal price differences
        dynamicRateOfChangeDeceleration = currentPaceDelta - priorPaceDelta;

        // 🧠 REVERSAL SENTRY COGNITIVE CLAMP:
        // If the trend line is pointing down, but the daily intervals are getting
        // progressively smaller (current delta < prior delta), institutional exhaustion is active [INDEX]!
        if (calculatedFirstDerivativeSlope < 0 && currentPaceDelta < priorPaceDelta)
        {
            isDeceleratingCompressionActive = true;
        }
    }

    // =========================================================================
    // 🎛️ STRATEGY REGIME EXTRATION MATRIX
    // =========================================================================
    let resolvedTrendBias = "NEUTRAL";

    // Ignore fractional sideways movements under 1.5 cents to suppress false market noise [INDEX]
    if (Math.abs(calculatedFirstDerivativeSlope) > 0.015)
    {
        resolvedTrendBias = calculatedFirstDerivativeSlope > 0 ? "BULLISH_AUCTION_CONVEXITY" : "BEARISH_AUCTION_DECLINE";
    }

    return {
        updatedHistoryLogs: combinedTimeline, // Restructure array payload back to database cache [INDEX]
        auctionTrendBias: resolvedTrendBias,
        auctionSlopeCoefficient: parseFloat(calculatedFirstDerivativeSlope.toFixed(3)),
        auctionVelocityDelta: parseFloat(dynamicRateOfChangeDeceleration.toFixed(3)),
        auctionDecelerationAlert: isDeceleratingCompressionActive
    };
}

module.exports = { processMultiDayCrossTrend }