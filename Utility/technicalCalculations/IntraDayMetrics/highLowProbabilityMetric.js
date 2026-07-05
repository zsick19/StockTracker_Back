/**
 * Calculates the exact historical percentage of days where the daily high and daily low
 * were established during the Morning, Midday, or Closing sessions (New York Market Time).
 * 
 * @param {Array} candles - Array of 5-minute candle objects: { Timestamp, HighPrice, LowPrice, ... }
 * @returns {Object} Comprehensive session statistics ready for visual dashboard rendering
 */
function calculateExtendedSessionProbabilities(candles)
{
    if (!candles || candles.length === 0) { return { totalDaysAnalyzed: 0, stats: null }; }

    // 1. Group the 5-minute candles by day (using New York market time strings)
    const daysData = {};

    candles.forEach(candle =>
    {
        const dateObj = new Date(candle.Timestamp);
        // Safely convert UTC to New York Market time
        const nyString = dateObj.toLocaleString("en-US", { timeZone: "America/New_York" });

        // Extract distinct date and clock time
        const [datePart, timePart] = nyString.split(", ");
        const [rawTime, ampm] = timePart.split(" ");
        let [hours, minutes] = rawTime.split(":");

        // Normalize to a clean 24-hour HH:MM format for strict string comparison
        let hourNum = parseInt(hours);
        if (ampm === "PM" && hourNum !== 12) hourNum += 12;
        if (ampm === "AM" && hourNum === 12) hourNum = 0;
        const timeKey = `${String(hourNum).padStart(2, "0")}:${minutes.padStart(2, "0")}`;

        // Filter out pre-market and after-hours data points
        if (timeKey < "09:30" || timeKey > "16:00") return;

        if (!daysData[datePart]) { daysData[datePart] = []; }

        daysData[datePart].push({ time: timeKey, high: candle.HighPrice, low: candle.LowPrice });
    });

    // 2. Initialize our historical session counter variables
    let totalDays = 0;

    let morningHighs = 0;   // 09:30 - 10:30 AM
    let morningLows = 0;

    let closingHighs = 0;   // 15:00 - 16:00 PM (3:00 - 4:00 PM)
    let closingLows = 0;

    let middayHighs = 0;    // 10:31 AM - 14:59 PM (The middle chop zone)
    let middayLows = 0;

    // 3. Process each trading day individually
    Object.keys(daysData).forEach(dateKey =>
    {
        const dayCandles = daysData[dateKey];
        if (dayCandles.length === 0) return;

        totalDays++;

        let dailyHigh = -Infinity;
        let dailyLow = Infinity;
        let timeOfHigh = "";
        let timeOfLow = "";

        // Track down the exact 5-minute coordinate of the daily extremes
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

        // Evaluate the HIGH time slot matrix
        if (timeOfHigh >= "09:30" && timeOfHigh <= "10:30")
        {
            morningHighs++;
        } else if (timeOfHigh >= "15:00" && timeOfHigh <= "16:00")
        {
            closingHighs++;
        } else
        {
            middayHighs++;
        }

        // Evaluate the LOW time slot matrix
        if (timeOfLow >= "09:30" && timeOfLow <= "10:30")
        {
            morningLows++;
        } else if (timeOfLow >= "15:00" && timeOfLow <= "16:00")
        {
            closingLows++;
        } else
        {
            middayLows++;
        }
    });

    if (totalDays === 0) return { totalDaysAnalyzed: 0, stats: null };

    // Helper utility to convert raw numbers safely into rounded percentages
    const toPercent = (count) => parseFloat(((count / totalDays) * 100).toFixed());

    return {
        openH: toPercent(morningHighs),
        openL: toPercent(morningLows),
        midH: toPercent(middayHighs),
        midL: toPercent(middayLows),
        closeH: toPercent(closingHighs),
        closeL: toPercent(closingLows)
    };
}

module.exports = { calculateExtendedSessionProbabilities }