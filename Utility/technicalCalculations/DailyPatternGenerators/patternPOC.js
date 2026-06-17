/**
 * Nightly Daily-Candle Volume Profile Extractor.
 * Extracts the master pattern POC ceiling using existing daily historical data
 * to completely eliminate the need for extra 5-minute API requests.
 * 
 * @param {Array} dailyCandles - Complete 180-day daily candle array from your nightly cache
 * @param {string} patternStartDate - The locked ISO date string where the pattern begins
 * @param {number} binSizeCents - Price bracket increment size (Default: 0.50 for daily charts)
 * @returns {number} High-probability master take-profit ceiling price
 */
function calculateNightlyDailyVolumePoc(dailyCandles, patternStartDate, binSizeCents = 0.50)
{
    if (!dailyCandles || dailyCandles.length === 0) return 0.00;

    // 1. Filter the daily dataset precisely from your pattern start date forward
    const targetTimestampFloor = new Date(patternStartDate).getTime();
    const relevantDailyWorkspace = dailyCandles.filter(c =>
    {
        return new Date(c.Timestamp).getTime() >= targetTimestampFloor;
    });

    if (relevantDailyWorkspace.length === 0)
    {
        return dailyCandles[dailyCandles.length - 1].ClosePrice;
    }

    const volumeProfileBins = {};
    let highestBinVolume = 0;
    let optimizedPocCeiling = relevantDailyWorkspace[relevantDailyWorkspace.length - 1].ClosePrice;

    // 2. Profile the volume density using daily bars
    relevantDailyWorkspace.forEach(candle =>
    {
        const binPrice = Math.floor(candle.ClosePrice / binSizeCents) * binSizeCents;
        volumeProfileBins[binPrice] = (volumeProfileBins[binPrice] || 0) + candle.Volume;
    });

    // 3. Isolate the coordinate holding maximum historical capital concentration
    Object.keys(volumeProfileBins).forEach(priceKey =>
    {
        const volume = volumeProfileBins[priceKey];
        if (volume > highestBinVolume)
        {
            highestBinVolume = volume;
            optimizedPocCeiling = parseFloat(priceKey);
        }
    });

    return parseFloat(optimizedPocCeiling.toFixed(2));
}

module.exports = { calculateNightlyDailyVolumePoc }