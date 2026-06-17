/**
 * Processes multiple days of 5-minute candles to calculate the historical probability
 * of the daily high or daily low printing during specific 5-minute intervals.
 * 
 * @param {Array} candles - Array of objects: { Timestamp (UTC string), HighPrice, LowPrice, ... }
 * @returns {Array} An array of time buckets (09:30 to 16:00) with localized NY time and high/low print probabilities
 */
function calculateHighLowTimeDistribution(candles)
{
    if (!candles || candles.length === 0) return [];

    // 1. Group candles by trading day (New York Time)
    const daysData = {};

    candles.forEach(candle =>
    {
        const dateObj = new Date(candle.Timestamp);
        const nyString = dateObj.toLocaleString("en-US", { timeZone: "America/New_York" });
        const nyDate = new Date(nyString);

        const dateKey = nyString.split(',')[0]; // Isolate date string: e.g., "6/2/2026"
        const hours = String(nyDate.getHours()).padStart(2, '0');
        const minutes = String(nyDate.getMinutes()).padStart(2, '0');
        const timeKey = `${hours}:${minutes}`;

        // Exclude pre-market and after-hours data points
        if (timeKey < "09:30" || timeKey > "16:00") return;

        if (!daysData[dateKey])
        {
            daysData[dateKey] = [];
        }

        daysData[dateKey].push({
            time: timeKey,
            high: candle.HighPrice,
            low: candle.LowPrice
        });
    });

    // 2. Track tally of hits for each 5-minute slot across history
    const timeBucketStats = {};
    let totalValidDays = 0;

    // Initialize all possible regular session time keys to ensure smooth rendering
    for (let h = 9; h <= 16; h++)
    {
        const startM = (h === 9) ? 30 : 0;
        const endM = (h === 16) ? 0 : 55;
        for (let m = startM; m <= endM; m += 5)
        {
            const timeKey = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            timeBucketStats[timeKey] = { highCount: 0, lowCount: 0 };
        }
    }

    // 3. Scan day by day to isolate the exact time of the daily high and daily low
    Object.keys(daysData).forEach(dateKey =>
    {
        const dayCandles = daysData[dateKey];
        if (dayCandles.length === 0) return;

        totalValidDays++;

        let dailyHigh = -Infinity;
        let dailyLow = Infinity;
        let timeOfHigh = "";
        let timeOfLow = "";

        // Find the absolute highest high and lowest low for this trading day
        dayCandles.forEach(candle =>
        {
            if (candle.high > dailyHigh)
            {
                dailyHigh = candle.high;
                timeOfHigh = candle.time;
            }
            if (candle.low < dailyLow)
            {
                dailyLow = candle.low;
                timeOfLow = candle.time;
            }
        });

        // Increment the counts for the specific time slots that caught the extreme pivots
        if (timeBucketStats[timeOfHigh]) timeBucketStats[timeOfHigh].highCount++;
        if (timeBucketStats[timeOfLow]) timeBucketStats[timeOfLow].lowCount++;
    });

    // 4. Normalize absolute tallies into raw percentage probabilities
    const resultProfile = Object.keys(timeBucketStats).map(timeKey =>
    {
        const stats = timeBucketStats[timeKey];

        // Combined probability that EITHER the high or low of the day forms in this 5 minutes
        const highProb = (stats.highCount / totalValidDays) * 100;
        const lowProb = (stats.lowCount / totalValidDays) * 100;
        const combinedProb = highProb + lowProb;

        // Visual categorization matching the "Traffic Light" dashboard layout
        let sessionZone = "MID_DAY";
        let visualAnchorColor = "#333333"; // Matte gray background for low-prob zones

        if (timeKey <= "10:30" || timeKey >= "15:00")
        {
            sessionZone = "STRIKE_ZONE";
            visualAnchorColor = "#FF3366"; // Vibrant crimson for high probability time bands
        }

        return {
            highProb: parseFloat(highProb.toFixed(2)),
            lowProb: parseFloat(lowProb.toFixed(2))
        };
    });

    // Return chronologically sorted data array ready for D3 component rendering
    return resultProfile.sort((a, b) => a.time.localeCompare(b.time));
}

module.exports = { calculateHighLowTimeDistribution }