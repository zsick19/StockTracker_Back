const { parse, addMinutes, format } = require('date-fns')

/**
 * Processes multiple days of 5-minute candles to map out the historical 
 * volume distribution and identify institutional volume clustering.
 * 
 * @param {Array} candles - Array of objects: { Timestamp (UTC string), Volume, ... }
 * @returns {Array} An array of time buckets (09:30 to 16:00) with localized NY time and volume percentages
 */
function calculateIntraDayVolumeDistribution(candles)
{
    if (!candles || candles.length === 0) return [];

    // 1. Group raw data into 5-minute time slots (e.g., "09:35", "15:45")
    const timeSlots = {};
    const dailyTotals = {};

    candles.forEach(candle =>
    {
        // Convert UTC timestamp to New York Market Time
        const dateObj = new Date(candle.Timestamp);
        const nyString = dateObj.toLocaleString("en-US", { timeZone: "America/New_York" });
        const nyDate = new Date(nyString);

        // Isolate the trading date and the specific 5-minute clock time
        const dateKey = nyDate.toISOString().split('T')[0];
        const hours = String(nyDate.getHours()).padStart(2, '0');
        const minutes = String(nyDate.getMinutes()).padStart(2, '0');
        const timeKey = `${hours}:${minutes}`;

        // Exclude pre-market and after-hours data points
        if (timeKey < "09:30" || timeKey > "16:00") return;

        // Accumulate volume for this specific time slot across history
        if (!timeSlots[timeKey]) { timeSlots[timeKey] = { totalVolume: 0, sampleCount: 0 }; }
        timeSlots[timeKey].totalVolume += candle.Volume;
        timeSlots[timeKey].sampleCount += 1;

        // Keep track of the total volume per day for normalization calculations
        if (!dailyTotals[dateKey]) dailyTotals[dateKey] = 0;
        dailyTotals[dateKey] += candle.Volume;
    });
    // 2. Compute the average absolute volume for each 5-minute interval
    const profile = Object.keys(timeSlots).map(time =>
    {
        const bucket = timeSlots[time];
        return {
            timeLabel: time,
            averageVolume: Math.round(bucket.totalVolume / bucket.sampleCount),
            distributionPercentage: 0 // Will be calculated in the next step
        };
    });

    // Sort chronologically from market open (09:30) to market close (16:00)
    profile.sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));

    // 3. Normalize: Convert absolute averages into a total share of the daily volume pie
    const totalProfileVolume = profile.reduce((sum, bucket) => sum + bucket.averageVolume, 0);

    let volShares = {

        firstHour: 0,
        midDay: 0,
        lastHour: 0,
        lastFiveMins: 0
    }
    // let lastH = (profile.length - 1) - 12
    // console.log(lastH)
    const results = profile.map((bucket, i) =>
    {
        // Percentage of the regular trading day's volume that flows through this exact 5 minutes
        const pct = (bucket.averageVolume / totalProfileVolume) * 100;

        if (i < 12) volShares.firstHour = volShares.firstHour + pct
        // else if (i >= 12 && i < 66) volShares.midDay = volShares.midDay + pct

        else if (i >= 66) volShares.lastHour = volShares.lastHour + pct
        return bucket.averageVolume
    });

    volShares.lastFiveMins = parseFloat((profile.at(-1).averageVolume / totalProfileVolume * 100).toFixed(2))
    volShares.midDay = parseInt((100 - volShares.firstHour - volShares.lastHour).toFixed(2))
    volShares.firstHour = parseInt(volShares.firstHour.toFixed(0))
    volShares.lastHour = parseInt(volShares.lastHour.toFixed(2))

    // const midDayResults = compileMiddayVolumeDensityMetrics(candles)

    const trial = findLowestVolumeHour(profile)
    console.log(trial)

    return {
        fiveMinAvgVolume: results,
        fiveMinAvgVolumeShare: volShares,
        fiveMinAvgLowestVolume: { ...trial }
    }
}




/**
 * Finds the 1-hour period with the lowest trading volume.
 * @param {Array<number>} volumes - Array of average volumes per 5-min candle.
 * @param {string} marketOpenTime - The start time of the array (24h format, default "09:30").
 */
function findLowestVolumeHour(volumes, marketOpenTime = "09:30")
{
    const WINDOW_SIZE = 12; // 12 candles = 60 minutes

    if (volumes.length < WINDOW_SIZE)
    {
        throw new Error("Not enough data to calculate a 1-hour span.");
    }

    let minVolume = Infinity;
    let startingIndex = 0;

    // 1. Sliding window to find the lowest volume sum
    for (let i = 0; i <= volumes.length - WINDOW_SIZE; i++)
    {
        let currentWindowVolume = 0;

        for (let j = 0; j < WINDOW_SIZE; j++)
        {
            currentWindowVolume += volumes[i + j].averageVolume;
        }

        if (currentWindowVolume < minVolume)
        {
            minVolume = currentWindowVolume;
            startingIndex = i;
        }
    }

    // 2. Map the index to actual times using date-fns
    const baseDate = new Date(); // Anchor date for parsing
    const marketOpenParsed = parse(marketOpenTime, 'HH:mm', baseDate);

    // Minutes elapsed from open to the start of this lowest window
    const minutesToStart = startingIndex * 5;

    const startTimeParsed = addMinutes(marketOpenParsed, minutesToStart);
    const endTimeParsed = addMinutes(startTimeParsed, 60);

    // 3. Return formatted results
    return {
        oneHourLowestVolume: `${format(startTimeParsed, 'h:mm a')} to ${format(endTimeParsed, 'h:mm a')}`,
        startingIndex: startingIndex
    };
}

// // === EXAMPLE USAGE ===
// // 78 candles represent a full 9:30 AM - 4:00 PM standard market day
// const mockVolumes = [
//     8500, 7200, 6400, 5100, // 09:30, 09:35, 09:40, 09:45
//     // ... let's simulate a massive midday dip at index 24 (11:30 AM)
//     1200, 1100, 950, 800, 850, 900, 950, 1000, 1100, 1050, 1150, 1200,
//     // ... volume picks back up
//     4500, 5100, 6200, 9500
// ];

// // If we put the dip near the start for testing purposes:
// const simpleMock = [
//     5000, 4800, // 9:30, 9:35
//     1100, 1200, 1050, 1300, 900, 950, 1100, 1150, 1200, 1000, 1050, 1100, // 12 candles starting at 9:40 (index 2)
//     4900, 5200
// ];

// const result = findLowestVolumeHour(simpleMock, "09:30");
// console.log(`Lowest volume hour: ${result.startTime} to ${result.endTime} (Vol: ${result.totalVolume})`);
// // Output: "Lowest volume hour: 9:40 AM to 10:40 AM (Vol: 13100)"



module.exports = { calculateIntraDayVolumeDistribution }