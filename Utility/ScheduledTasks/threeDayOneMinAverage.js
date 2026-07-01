/**
 * PRODUCTION COMPILER: calculateThreeDayOneMinVolumeBaseline
 * Extracts the mean volume printed per 1-minute regular session candlestick
 * across a trailing 3-day history to establish dynamic institutional size filters.
 * 
 * @param {Array} historical1MinCandles - Raw historical 1-minute bars array from your background prefetch
 * @returns {number} Integer representing the mean regular-trading-hours 1-minute volume footprint
 */
function calculateThreeDayOneMinVolumeBaseline(historical1MinCandles)
{
    // Default safe fallback placeholder (10,000 shares/min) if data array lacks properties
    const defaultVolumeFallback = 10000;

    if (!historical1MinCandles || historical1MinCandles.length === 0) { return defaultVolumeFallback; }

    let totalAccumulatedRthVolume = 0;
    let totalValidRthBarsCount = 0;

    // =========================================================================
    // ⏰ STEP A: regular SESSION HOURS GATING (09:30 AM - 04:00 PM EST)
    // =========================================================================
    historical1MinCandles.forEach(candle =>
    {
        // Support multiple possible naming keys back from database vs raw Alpaca payload
        const rawTimestamp = candle.Timestamp || candle.t || candle.timestamp;
        const volumeValue = candle.Volume || candle.v || 0;

        if (!rawTimestamp || volumeValue === 0) return;

        const dateObj = new Date(rawTimestamp);
        const nyTimeStr = dateObj.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });

        const isInsideRegularTradingHours = nyTimeStr >= "09:30:00" && nyTimeStr <= "16:00:00";

        // =========================================================================
        // 📊 STEP B: VOLUMETRIC ARITHMETIC SUMMATION
        // =========================================================================
        if (isInsideRegularTradingHours)
        {
            totalValidRthBarsCount++;
            totalAccumulatedRthVolume += volumeValue;
        }
    });

    if (totalValidRthBarsCount === 0)
    {
        return defaultVolumeFallback;
    }

    // =========================================================================
    // 📐 STEP C: INT-MAPPED FRACTIONAL PROPORTION RESOLUTION
    // =========================================================================
    // Calculate the mathematical mean volume per minute, rounding cleanly to the nearest whole share
    const calculatedMeanOneMinVolume = Math.round(totalAccumulatedRthVolume / totalValidRthBarsCount);

    // Enforce a strict minimum floor barrier of 100 shares to prevent math errors on illiquid names
    return Math.max(100, calculatedMeanOneMinVolume);
}

module.exports = { calculateThreeDayOneMinVolumeBaseline }