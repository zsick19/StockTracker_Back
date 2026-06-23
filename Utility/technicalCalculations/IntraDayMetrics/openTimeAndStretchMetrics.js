/**
 * Advanced Multi-Directional Morning Stretch & Rebound Engine.
 * Calculates positive/negative opening extensions, average time of morning extremes,
 * and subsequent intraday rebound probabilities.
 * 
 * @param {Array} candles - Array of 5-minute candle objects: { Timestamp, OpenPrice, ClosePrice, HighPrice, LowPrice }
 * @returns {Object} Complete data report for dashboard time-gating and target mapping
 */
function calculateOpenTimeAndStretchMetrics(candles)
{
    if (!candles || candles.length === 0)
    {
        return { totalDaysAnalyzed: 0, statistics: null };
    }

    // 1. Group the 5-minute candles by day (New York Market Time)
    const daysData = {};

    candles.forEach(candle =>
    {
        const dateObj = new Date(candle.Timestamp);
        const nyString = dateObj.toLocaleString("en-US", { timeZone: "America/New_York" });

        const [datePart, timePart] = nyString.split(", ");
        const [rawTime, ampm] = timePart.split(" ");
        let [hours, minutes] = rawTime.split(":");

        let hourNum = parseInt(hours);
        if (ampm === "PM" && hourNum !== 12) hourNum += 12;
        if (ampm === "AM" && hourNum === 12) hourNum = 0;
        const timeKey = `${String(hourNum).padStart(2, "0")}:${minutes.padStart(2, "0")}`;

        // Focus strictly on regular market hours (9:30 AM to 4:00 PM ET)
        if (timeKey < "09:30" || timeKey > "16:00") return;

        if (!daysData[datePart])
        {
            daysData[datePart] = [];
        }

        daysData[datePart].push({
            time: timeKey,
            open: candle.OpenPrice,
            high: candle.HighPrice,
            low: candle.LowPrice,
            close: candle.ClosePrice
        });
    });

    // 2. Trackers for Downward Openings (Downside Stretch & Rebound)
    let downOpeningDaysCount = 0;
    let downReboundSuccessCount = 0;
    let totalDownStretchPercent = 0;
    let totalDownReboundSizePercent = 0;
    let downBottomMinutesSum = 0; // For tracking average time of the low

    // Trackers for Upward Openings (Upside Stretch & Pullback)
    let upOpeningDaysCount = 0;
    let upPullbackSuccessCount = 0;
    let totalUpStretchPercent = 0;
    let totalUpPullbackSizePercent = 0;
    let upPeakMinutesSum = 0; // For tracking average time of the high

    // Helper to convert HH:MM string to absolute minutes from midnight
    const timeToMinutes = (timeStr) =>
    {
        const [h, m] = timeStr.split(":").map(Number);
        return h * 60 + m;
    };

    // Helper to convert absolute minutes back to an HH:MM AM/PM string for display
    const minutesToTimeString = (totalMinutes) =>
    {
        let h = Math.floor(totalMinutes / 60);
        let m = Math.round(totalMinutes % 60);
        let ampm = h >= 12 ? "PM" : "AM";
        h = h % 12;
        h = h ? h : 12; // Convert 0 to 12
        return { hour: h, minute: m }
    };

    // 3. Evaluate Day-by-Day Sequences
    Object.keys(daysData).forEach(dateKey =>
    {
        const dayCandles = daysData[dateKey];
        if (dayCandles.length === 0) return;

        // Enforce strict chronological tracking
        dayCandles.sort((a, b) => a.time.localeCompare(b.time));

        const dayOpenPrice = dayCandles[0].open;
        const morningSession = dayCandles.filter(c => c.time <= "10:30");

        // --- SECTION A: ANALYZE THE MORNING CORES (09:30 - 10:30 AM) ---
        let morningLow = Infinity;
        let timeOfMorningLow = "";
        let morningHigh = -Infinity;
        let timeOfMorningHigh = "";

        morningSession.forEach(candle =>
        {
            if (candle.low < morningLow)
            {
                morningLow = candle.low;
                timeOfMorningLow = candle.time;
            }
            if (candle.high > morningHigh)
            {
                morningHigh = candle.high;
                timeOfMorningHigh = candle.time;
            }
        });

        // --- SECTION B: DOWNSIDE ANALYSIS (Selling Stretch & Rebound) ---
        if (morningLow < dayOpenPrice)
        {
            downOpeningDaysCount++;

            // Calculate absolute size of the initial downside flush
            const downStretch = ((dayOpenPrice - morningLow) / dayOpenPrice) * 100;
            totalDownStretchPercent += downStretch;
            downBottomMinutesSum += timeToMinutes(timeOfMorningLow);

            // Scan the remaining candles AFTER the morning bottom to check for a full rebound
            let brokeOpenPrice = false;
            let maxHighAfterLow = -Infinity;
            const postLowCandles = dayCandles.filter(c => c.time > timeOfMorningLow);

            postLowCandles.forEach(c =>
            {
                if (c.high > dayOpenPrice) brokeOpenPrice = true;
                if (c.high > maxHighAfterLow) maxHighAfterLow = c.high;
            });

            if (brokeOpenPrice)
            {
                downReboundSuccessCount++;
                const reboundSize = ((maxHighAfterLow - morningLow) / morningLow) * 100;
                totalDownReboundSizePercent += reboundSize;
            }
        }

        // --- SECTION C: UPSIDE ANALYSIS (Buying Stretch & Pullback) ---
        if (morningHigh > dayOpenPrice)
        {
            upOpeningDaysCount++;

            // Calculate absolute size of the initial upside spike
            const upStretch = ((morningHigh - dayOpenPrice) / dayOpenPrice) * 100;
            totalUpStretchPercent += upStretch;
            upPeakMinutesSum += timeToMinutes(timeOfMorningHigh);

            // Scan the remaining candles AFTER the morning peak to check for a reversal drop below open
            let brokeBelowOpenPrice = false;
            let minLowAfterHigh = Infinity;
            const postHighCandles = dayCandles.filter(c => c.time > timeOfMorningHigh);

            postHighCandles.forEach(c =>
            {
                if (c.low < dayOpenPrice) brokeBelowOpenPrice = true;
                if (c.low < minLowAfterHigh) minLowAfterHigh = c.low;
            });

            if (brokeBelowOpenPrice)
            {
                upPullbackSuccessCount++;
                const pullbackSize = ((morningHigh - minLowAfterHigh) / morningHigh) * 100;
                totalUpPullbackSizePercent += pullbackSize;
            }
        }
    });

    const totalDays = Object.keys(daysData).length;
    if (totalDays === 0) return { totalDaysAnalyzed: 0 };

    // 4. package up the unified statistical coordinates
    return {
        downSide: {
            sampleSizeDays: downOpeningDaysCount,
            averageInitialDropStretch: parseFloat((totalDownStretchPercent / (downOpeningDaysCount || 1)).toFixed(2)),
            averageTimeToBottom: downOpeningDaysCount ? minutesToTimeString(downBottomMinutesSum / downOpeningDaysCount) : undefined,
            reboundProbability: parseFloat(((downReboundSuccessCount / (downOpeningDaysCount || 1)) * 100).toFixed(2)),
            averageSuccessfulReboundExpansion: downReboundSuccessCount ? parseFloat((totalDownReboundSizePercent / downReboundSuccessCount).toFixed(2)) : undefined
        },
        upSide: {
            sampleSizeDays: upOpeningDaysCount,
            averageInitialRallyStretch: parseFloat((totalUpStretchPercent / (upOpeningDaysCount || 1)).toFixed(2)),
            averageTimeToPeak: upOpeningDaysCount ? minutesToTimeString(upPeakMinutesSum / upOpeningDaysCount) : undefined,
            pullbackBelowOpenProbability: parseFloat(((upPullbackSuccessCount / (upOpeningDaysCount || 1)) * 100).toFixed(2)),
            averageSuccessfulPullbackSize: upPullbackSuccessCount ? parseFloat((totalUpPullbackSizePercent / upPullbackSuccessCount).toFixed(2)) : undefined
        }
    };
}

module.exports = { calculateOpenTimeAndStretchMetrics }