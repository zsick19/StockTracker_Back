
const { format } = require('date-fns')
const { toZonedTime } = require('date-fns-tz')
/**
 * Institutional Regular Session Time Filter.
 * Evaluates a raw historical candlestick array and filters out pre-market 
 * and after-hours bars, leaving only 09:30 AM to 16:00 PM Eastern regular hours data.
 * 
 * @param {Array} rawHistoricalCandles - Unsorted candlestick array containing extended hours data
 * @returns {Array} Clean, chronologically sorted array of regular session candles
 */
function filterRegularSessionCandles(rawHistoricalCandles)
{
    if (!rawHistoricalCandles || rawHistoricalCandles.length === 0) return [];

    // Sort chronologically to ensure seamless lookback tracking
    const sortedCandles = [...rawHistoricalCandles].sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

    return sortedCandles.filter(candle =>
    {
        const timeObj = new Date(candle.Timestamp);

        // Force the machine clock to New York Time to accurately align with exchange gates
        const nyTime = toZonedTime(timeObj, 'America/New_York');

        // Format to a clean time string for explicit range checking (e.g., "09:45")
        const currentNYTimeStr = format(nyTime, 'HH:mm');

        // Allow bars strictly inside regular hours session boundaries
        return currentNYTimeStr >= '09:30' && currentNYTimeStr <= '16:00';
    });
}

module.exports = { filterRegularSessionCandles }