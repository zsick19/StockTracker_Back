/**
 * Master Continuation Gain & Confidence Projection Engine.
 * Ingests daily candles, evaluates momentum velocity, and projects
 * 1-day, 2-day, and 3-day upside price targets paired with a recency-decay confidence matrix [INDEX].
 * 
 * @param {Array} dailyCandles - Complete daily candlestick historical cache from your store
 * @param {string} patternStartDate - The user-selected date where the upward continuation leg launched
 * @param {number} stockBeta - The asset's daily Beta value supplied from your database
 */
function projectContinuationTrendMetrics(dailyCandles, patternStartDate, stockBeta = 1.0)
{
    if (!dailyCandles || dailyCandles.length < 15) { return { success: false, error: "Insufficient daily historical dataset provided." }; }

    // 1. Isolate the active continuation leg from your user-selected start date forward [INDEX]
    const targetTimestampFloor = new Date(patternStartDate).getTime();
    const trendWorkspace = dailyCandles.filter(c => new Date(c.Timestamp).getTime() >= targetTimestampFloor)
        .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

    const n = trendWorkspace.length;
    if (n < 3) return { success: false, error: "Insufficient trading days elapsed since trend start date." };

    // 2. RUN THE 15-DAY MOMENTUM REGRESSION GRADIENT
    const activeLeg = trendWorkspace.slice(-15);
    const mLen = activeLeg.length;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    activeLeg.forEach((candle, idx) =>
    {
        sumX += idx;
        sumY += candle.ClosePrice;
        sumXY += (idx * candle.ClosePrice);
        sumX2 += (idx * idx);
    });

    const slope = ((mLen * sumXY) - (sumX * sumY)) / ((mLen * sumX2) - (sumX * sumX));
    const intercept = (sumY - (slope * sumX)) / mLen;

    // 3. EVALUATE RECENT OVERNIGHT GAP RETENTION & VELOCITY
    let uncompromisedGapsCount = 0;
    let totalRealBodySizes = 0;
    let totalDailyRanges = 0;
    let totalRecentVelocityPct = 0;
    let recentVelocityDaysTracked = 0;

    // Evaluate the last 5 days heavily to map immediate forward velocity
    for (let i = trendWorkspace.length - 1; i >= Math.max(1, trendWorkspace.length - 5); i--)
    {
        const today = trendWorkspace[i];
        const yesterday = trendWorkspace[i - 1];

        totalRealBodySizes += Math.abs(today.ClosePrice - today.OpenPrice);
        totalDailyRanges += (today.HighPrice - today.LowPrice);

        // Daily expansion distance percent
        const dailyMovePct = (today.ClosePrice - yesterday.ClosePrice) / yesterday.ClosePrice;
        totalRecentVelocityPct += dailyMovePct;
        recentVelocityDaysTracked++;

        if (today.LowPrice > yesterday.ClosePrice)
        {
            uncompromisedGapsCount++;
        }
    }

    const trendEfficiencyRatio = totalDailyRanges === 0 ? 1 : totalRealBodySizes / totalDailyRanges;
    const avgRecentDailyExpansionRate = totalRecentVelocityPct / (recentVelocityDaysTracked || 1);

    // 4. GENERATE THE MOMENTUM QUALITY SCORE (0 - 100)
    let momentumScore = 0;
    if (slope > 0.15) momentumScore += 40;
    if (slope > 0.40) momentumScore += 15;
    if (uncompromisedGapsCount >= 2) momentumScore += 25;
    if (trendEfficiencyRatio >= 0.70) momentumScore += 20;

    const finalizedHealthScore = Math.min(Math.max(momentumScore, 0), 100);
    const isTrendStrong = finalizedHealthScore >= 50 && slope > 0;

    // 5. COMPUTE FORWARD PRICE EXTENSION PROJECTIONS
    const liveClosePrice = trendWorkspace[n - 1].ClosePrice;

    // Smooth the daily expected growth rate by combining the historical slope delta and recent percentage expansion
    const compositeGrowthRate = isTrendStrong
        ? (avgRecentDailyExpansionRate + (slope / liveClosePrice)) / 2
        : (avgRecentDailyExpansionRate * 0.30); // Heavy discount factor if trend is failing health checks

    // Generate targets using compounding expectation trajectories [INDEX]
    const targetDay1 = liveClosePrice * (1 + compositeGrowthRate);
    const targetDay2 = targetDay1 * (1 + (compositeGrowthRate * 0.90)); // Diminishing marginal velocity factor
    const targetDay3 = targetDay2 * (1 + (compositeGrowthRate * 0.75));

    // Calculate percentage potential gains from today's closing print
    const gainPct1 = ((targetDay1 - liveClosePrice) / liveClosePrice) * 100;
    const gainPct2 = ((targetDay2 - liveClosePrice) / liveClosePrice) * 100;
    const gainPct3 = ((targetDay3 - liveClosePrice) / liveClosePrice) * 100;

    // --- PHASE 6: TIME-DECAY CONFIDENCE COEFFICIENT MATRIX ---
    // Confidence decays naturally over time due to compounding market variance [INDEX]. 
    // High Beta stocks decay faster because volatility breaks short-term extensions quickly [INDEX].
    const baseConfidence = finalizedHealthScore; // Core anchor point is the trend health score

    const decayMultiplierDay1 = 1.0;
    const decayMultiplierDay2 = Math.max(0.20, 0.85 - (0.05 * stockBeta));
    const decayMultiplierDay3 = Math.max(0.10, 0.65 - (0.12 * stockBeta));

    const confidenceDay1 = Math.round(baseConfidence * decayMultiplierDay1);
    const confidenceDay2 = Math.round(baseConfidence * decayMultiplierDay2);
    const confidenceDay3 = Math.round(baseConfidence * decayMultiplierDay3);

    // Tomorrow's static risk boundaries
    const avgDailyRange = trendWorkspace.reduce((sum, c) => sum + (c.HighPrice - c.LowPrice), 0) / n;
    const tomorrowEntryPriceTarget = liveClosePrice - (avgDailyRange * 0.25) + slope;
    const dynamicStopCushionPercent = 0.0075 * stockBeta;
    const calculatedStopLossPrice = liveClosePrice * (1 - dynamicStopCushionPercent);

    return {
        trendHealthScore: finalizedHealthScore,
        calculatedDailyGrowthRate: parseFloat((compositeGrowthRate * 100).toFixed(4)),
        entryTrigger: parseFloat(tomorrowEntryPriceTarget.toFixed(2)),
        invalidationStop: parseFloat(calculatedStopLossPrice.toFixed(2)),
        anchorDate: patternStartDate,
        anchorMidPrice: trendWorkspace[0].HighPrice - ((trendWorkspace[0].HighPrice - trendWorkspace[0].LowPrice) / 2),
        projection: {
            oneDay: {
                projectedTargetPrice: parseFloat(targetDay1.toFixed(2)),
                expectedTotalGainPercent: parseFloat(gainPct1.toFixed(2)),
                confidenceScore: Math.min(100, Math.max(0, confidenceDay1)),
                classification: confidenceDay1 >= 75 ? "HIGH_CONVICTION_RUN" : "MODERATE_CONTINUATION"
            },
            twoDays: {
                projectedTargetPrice: parseFloat(targetDay2.toFixed(2)),
                expectedTotalGainPercent: parseFloat(gainPct2.toFixed(2)),
                confidenceScore: Math.min(100, Math.max(0, confidenceDay2)),
                classification: confidenceDay2 >= 60 ? "STABLE_EXTRAGRADIENT" : "EXHAUSTION_WARNING"
            },
            threeDays: {
                projectedTargetPrice: parseFloat(targetDay3.toFixed(2)),
                expectedTotalGainPercent: parseFloat(gainPct3.toFixed(2)),
                confidenceScore: Math.min(100, Math.max(0, confidenceDay3)),
                classification: confidenceDay3 >= 50 ? "POTENTIAL_CYCLE_EXTENSION" : "HIGH_REVERSAL_RISK"
            }
        }
    };
}

module.exports = { projectContinuationTrendMetrics }