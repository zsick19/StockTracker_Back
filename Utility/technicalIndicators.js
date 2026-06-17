function calculateCurrentSingleRSI(chartingData, period = 14)
{
    if (chartingData.length <= period) return null;

    // Extract closing prices
    const prices = chartingData.map(c => c.ClosePrice);
    let gains = 0;
    let losses = 0;

    // 1. Initial Average: First 'period' intervals
    for (let i = 1; i <= period; i++)
    {
        const diff = prices[i] - prices[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // 2. Wilder's Smoothing: Remaining intervals up to the latest
    for (let i = period + 1; i < prices.length; i++)
    {
        const diff = prices[i] - prices[i - 1];
        const currentGain = diff >= 0 ? diff : 0;
        const currentLoss = diff < 0 ? -diff : 0;

        avgGain = (avgGain * (period - 1) + currentGain) / period;
        avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return Number.parseFloat(100 - (100 / (1 + rs)).toFixed(2))
}


const calculateEMADataPoints = (candleData, period) =>
{
    let emaArray = []
    let results = []
    var k = 2 / (period + 1);
    emaArray = [candleData[0].ClosePrice];
    for (var i = 1; i < candleData.length; i++) { emaArray.push(candleData[i].ClosePrice * k + emaArray[i - 1] * (1 - k)); }

    for (var i = 0; i < emaArray.length; i++) { results.push({ date: candleData[i].Timestamp, value: emaArray[i] }); }
    return Number.parseFloat(emaArray.at(-1).toFixed(2))
}



//  Calculates Average True Range (ATR)
//  @param {Array} candles - Array of objects {high: number, low: number, close: number}
//  @param {number} period - The lookback period (typically 14)
//  @returns {Array} - Array of ATR values (null for early periods) 
function calculateATR(candles, period = 14)
{
    if (candles.length < period) return [];
    let atr = new Array(candles.length).fill(null);
    let tr = new Array(candles.length);

    // 1. Calculate True Range (TR) for each candle
    for (let i = 0; i < candles.length; i++)
    {
        const current = candles[i];
        if (i === 0)
        {
            tr[i] = current.HighPrice - current.LowPrice; // First candle has no previous close
        } else
        {
            const prevClose = candles[i - 1].ClosePrice;
            tr[i] = Math.max(
                current.HighPrice - current.LowPrice,
                Math.abs(current.HighPrice - prevClose),
                Math.abs(current.LowPrice - prevClose)
            );
        }
    }

    // 2. Calculate initial ATR (Simple Moving Average of first 'n' TR values)
    let sumTR = 0;
    for (let i = 0; i < period; i++)
    {
        sumTR += tr[i];
    }
    atr[period - 1] = sumTR / period;

    // 3. Calculate subsequent ATR values using Wilder's Smoothing
    // Formula: ATR_new = ((ATR_prev * (n - 1)) + TR_current) / n
    for (let i = period; i < candles.length; i++)
    {
        atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }

    return Number.parseFloat(atr.at(-1).toFixed(2))

}

/**
 * Calculates the exact historical percentage of days where the daily high and daily low
 * were established during the Morning, Midday, or Closing sessions (New York Market Time).
 * 
 * @param {Array} candles - Array of 5-minute candle objects: { Timestamp, HighPrice, LowPrice, ... }
 * @returns {Object} Comprehensive session statistics ready for visual dashboard rendering
 */
function calculateExtendedSessionProbabilities(candles)
{
    if (!candles || candles.length === 0)
    {
        return { totalDaysAnalyzed: 0, stats: null };
    }

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

        if (!daysData[datePart])
        {
            daysData[datePart] = [];
        }

        daysData[datePart].push({
            time: timeKey,
            high: candle.HighPrice,
            low: candle.LowPrice
        });
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
    const toPercent = (count) => parseFloat(((count / totalDays) * 100).toFixed(2));

    // 4. package up the statistical coordinates
    return {
        totalDaysAnalyzed: totalDays,
        morningSession: {
            timeFrame: "09:30 AM - 10:30 AM ET",
            highPrintedPercent: toPercent(morningHighs),
            lowPrintedPercent: toPercent(morningLows)
        },
        middaySession: {
            timeFrame: "10:31 AM - 02:59 PM ET",
            highPrintedPercent: toPercent(middayHighs),
            lowPrintedPercent: toPercent(middayLows)
        },
        closingSession: {
            timeFrame: "03:00 PM - 04:00 PM ET",
            highPrintedPercent: toPercent(closingHighs),
            lowPrintedPercent: toPercent(closingLows)
        }
    };
}



/**
 * Advanced Multi-Directional Morning Stretch & Rebound Engine.
 * Calculates positive/negative opening extensions, average time of morning extremes,
 * and subsequent intraday rebound probabilities.
 * 
 * @param {Array} candles - Array of 5-minute candle objects: { Timestamp, OpenPrice, ClosePrice, HighPrice, LowPrice }
 * @returns {Object} Complete data report for dashboard time-gating and target mapping
 */
function calculateCompleteMorningMetrics(candles)
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
    const minutesToTimeValues = (totalMinutes) =>
    {
        let h = Math.floor(totalMinutes / 60);
        let m = Math.round(totalMinutes % 60);
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
        downsideMetrics: {
            sampleSizeDays: downOpeningDaysCount,
            averageInitialDropStretch: parseFloat((totalDownStretchPercent / (downOpeningDaysCount || 1)).toFixed(2)),
            averageTimeToBottom: downOpeningDaysCount ? minutesToTimeValues(downBottomMinutesSum / downOpeningDaysCount) : undefined,
            reboundProbability: parseFloat(((downReboundSuccessCount / (downOpeningDaysCount || 1)) * 100).toFixed(2)),
            averageSuccessfulReboundExpansion: downReboundSuccessCount ? parseFloat((totalDownReboundSizePercent / downReboundSuccessCount).toFixed(2)) : undefined
        },
        upsideMetrics: {
            sampleSizeDays: upOpeningDaysCount,
            averageInitialRallyStretch: parseFloat((totalUpStretchPercent / (upOpeningDaysCount || 1)).toFixed(2)),
            averageTimeToPeak: upOpeningDaysCount ? minutesToTimeValues(upPeakMinutesSum / upOpeningDaysCount) : undefined,
            pullbackBelowOpenProbability: parseFloat(((upPullbackSuccessCount / (upOpeningDaysCount || 1)) * 100).toFixed(2)),
            averageSuccessfulPullbackSize: upPullbackSuccessCount ? parseFloat((totalUpPullbackSizePercent / upPullbackSuccessCount).toFixed(2)) : undefined
        }
    };
}


function calculateCorrelation(dataA, dataB, window = 20)
{
    const result = [];
    const pricesA = dataA.map(d => d.ClosePrice);
    const pricesB = dataB.map(d => d.ClosePrice);

    let todaysValue
    for (let i = window; i <= pricesA.length; i++)
    {
        const sliceA = pricesA.slice(i - window, i);
        const sliceB = pricesB.slice(i - window, i);
        const corr = calculatePearson(sliceA, sliceB);
        if (i === pricesA.length) todaysValue = corr.toFixed(2)
    }
    return todaysValue


    function calculatePearson(a, b)
    {
        const n = a.length;
        const meanA = a.reduce((s, v) => s + v) / n;
        const meanB = b.reduce((s, v) => s + v) / n;
        let num = 0, denA = 0, denB = 0;
        for (let i = 0; i < n; i++)
        {
            const dA = a[i] - meanA, dB = b[i] - meanB;
            num += dA * dB;
            denA += dA ** 2;
            denB += dB ** 2;
        }
        return num / Math.sqrt(denA * denB) || 0;
    }

}



/**
 * Processes historical 5-minute candles using a 15-minute whiplash buffer.
 * Accepts milestone parameters as structured time objects and returns array-only stats.
 * 
 * @param {Array} historyCandles - Historical 5-minute candles: { Timestamp, Volume, OpenPrice, ClosePrice }
 * @param {Object} avgMorningHighTime - Up-day milestone: { hour: 9, minute: 51 }
 * @param {Object} avgMorningLowTime - Down-day milestone: { hour: 10, minute: 02 }
 */
function seedHistoricalOpeningHourVolume(historyCandles, avgMorningHighTime, avgMorningLowTime)
{
    if (!historyCandles || historyCandles.length === 0) { throw new Error("No historical data provided."); }

    // Convert configuration time objects into a raw integer minute format for fast math comparisons
    const targetHighMinutes = (avgMorningHighTime.hour * 60) + avgMorningHighTime.minute;
    const targetLowMinutes = (avgMorningLowTime.hour * 60) + avgMorningLowTime.minute;

    const daysData = {};
    historyCandles.forEach(candle =>
    {
        const dateObj = new Date(candle.Timestamp);
        // Safely align UTC timestamps with regular New York market time
        const nyString = dateObj.toLocaleString("en-US", { timeZone: "America/New_York" });
        const [datePart, timePart] = nyString.split(", ");
        const [rawTime, ampm] = timePart.split(" ");
        let [hours, minutes] = rawTime.split(":");

        let hourNum = parseInt(hours);
        if (ampm === "PM" && hourNum !== 12) hourNum += 12;
        if (ampm === "AM" && hourNum === 12) hourNum = 0;

        const timeKey = `${String(hourNum).padStart(2, "0")}:${minutes.padStart(2, "0")}`;
        const totalMinutesFromMidnight = (hourNum * 60) + parseInt(minutes);

        // Keep database storage clean by isolating the opening hour block (09:30 to 10:30 AM ET)
        if (timeKey < "09:30" || timeKey > "10:30") return;

        if (!daysData[datePart]) daysData[datePart] = [];
        daysData[datePart].push({
            timeKey: timeKey,
            minutes: totalMinutesFromMidnight,
            volume: candle.Volume,
            open: candle.OpenPrice,
            close: candle.ClosePrice
        });
    });

    const rawUpDays = {};
    const rawDownDays = {};
    let upDaysCount = 0;
    let downDaysCount = 0;

    let totalCumulativeUpVolumeToHighTime = 0;
    let totalCumulativeDownVolumeToLowTime = 0;

    // Evaluate each trading day through the 15-minute whiplash buffer
    Object.keys(daysData).forEach(dateKey =>
    {
        const dayCandles = daysData[dateKey];
        dayCandles.sort((a, b) => a.timeKey.localeCompare(b.timeKey));

        const initialCandle = dayCandles.find(c => c.timeKey === "09:30");
        const bufferCandle = dayCandles.find(c => c.timeKey === "09:40"); // Closes at 09:45 AM

        if (!initialCandle || !bufferCandle) return;

        // Core 15-minute structural range filter
        const isTrueUpOpen = bufferCandle.close >= initialCandle.open;
        const targetRawMap = isTrueUpOpen ? rawUpDays : rawDownDays;

        if (isTrueUpOpen)
        {
            upDaysCount++;
            // Sum cumulative volume bars up to the high time configuration minute
            dayCandles.forEach(c =>
            {
                if (c.minutes <= targetHighMinutes) totalCumulativeUpVolumeToHighTime += c.volume;
            });
        } else
        {
            downDaysCount++;
            // Sum cumulative volume bars up to the low time configuration minute
            dayCandles.forEach(c =>
            {
                if (c.minutes <= targetLowMinutes) totalCumulativeDownVolumeToLowTime += c.volume;
            });
        }

        dayCandles.forEach(candle =>
        {
            if (!targetRawMap[candle.timeKey])
            {
                targetRawMap[candle.timeKey] = { totalVolume: 0, count: 0 };
            }
            targetRawMap[candle.timeKey].totalVolume += candle.volume;
            targetRawMap[candle.timeKey].count++;
        });
    });

    // Helper function to bundle integer matrix arrays
    const compilePureArrays = (rawMap) =>
    {
        const chronologicalTimeKeys = [
            "09:30", "09:35", "09:40", "09:45", "09:50", "09:55",
            "10:00", "10:05", "10:10", "10:15", "10:20", "10:25", "10:30"
        ];

        const fiveMinuteSegmentsArray = chronologicalTimeKeys.map(key =>
        {
            const dataPoint = rawMap[key];
            return dataPoint ? Math.round(dataPoint.totalVolume / dataPoint.count) : 0;
        });

        const tenMinuteBlocksArray = [
            fiveMinuteSegmentsArray[0] + fiveMinuteSegmentsArray[1],
            fiveMinuteSegmentsArray[2] + fiveMinuteSegmentsArray[3],
            fiveMinuteSegmentsArray[4] + fiveMinuteSegmentsArray[5],
            fiveMinuteSegmentsArray[6] + fiveMinuteSegmentsArray[7],
            fiveMinuteSegmentsArray[8] + fiveMinuteSegmentsArray[9],
            fiveMinuteSegmentsArray[10] + fiveMinuteSegmentsArray[11]
        ];

        return {
            fiveMinutes: fiveMinuteSegmentsArray,
            tenMinutes: tenMinuteBlocksArray
        };
    };
    let upOpeningDaysProfile = compilePureArrays(rawUpDays)
    let downOpeningDaysProfile = compilePureArrays(rawDownDays)

    return {
        upOpenDays: upDaysCount,
        downOpenDays: downDaysCount,
        avgUpVolToHighTime: upDaysCount === 0 ? 0 : Math.round(totalCumulativeUpVolumeToHighTime / upDaysCount),
        avgDownVolToLowTime: downDaysCount === 0 ? 0 : Math.round(totalCumulativeDownVolumeToLowTime / downDaysCount),
        fiveMinUpDay: upOpeningDaysProfile.fiveMinutes,
        tenMinUpDay: upOpeningDaysProfile.tenMinutes,
        fiveMinDownDay: downOpeningDaysProfile.fiveMinutes,
        tenMinDownDay: downOpeningDaysProfile.tenMinutes,
        preMarketUpThirtyMinBlocks: compilePreMarketArray(rawPreMarketUpDays),
        preMarketDownThirtyMinBlocks: compilePreMarketArray(rawPreMarketDownDays)
    };
}























/**
 * Processes historical 5-minute candles using a 15-minute whiplash buffer.
 * Calculates baseline opening averages as pure arrays, and adds a separate sequential array
 * for 30-minute pre-market volume increments between 4:00 AM and 9:30 AM ET.
 * 
 * @param {Array} historyCandles - Historical 5-minute candles: { Timestamp, Volume, OpenPrice, ClosePrice }
 * @param {Object} avgMorningHighTime - Up-day milestone: { hour: 9, minute: 51 }
 * @param {Object} avgMorningLowTime - Down-day milestone: { hour: 10, minute: 2 }
 */
function seedHistoricalVolumeWithPreMarket(historyCandles, avgMorningHighTime, avgMorningLowTime)
{
    if (!historyCandles || historyCandles.length === 0) { throw new Error("No historical data provided."); }

    const targetHighMinutes = (avgMorningHighTime.hour * 60) + avgMorningHighTime.minute;
    const targetLowMinutes = (avgMorningLowTime.hour * 60) + avgMorningLowTime.minute;

    const daysData = {};
    historyCandles.forEach(candle =>
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
        const totalMinutesFromMidnight = (hourNum * 60) + parseInt(minutes);

        // Capture data from 4:00 AM ET all the way to the end of the opening hour (10:30 AM ET)
        if (timeKey < "04:00" || timeKey > "10:30") return;

        if (!daysData[datePart]) daysData[datePart] = [];
        daysData[datePart].push({
            timeKey: timeKey,
            minutes: totalMinutesFromMidnight,
            volume: candle.Volume,
            open: candle.OpenPrice,
            close: candle.ClosePrice
        });
    });

    // Structures to hold raw data for averaging later
    const rawUpDays = {};
    const rawDownDays = {};
    const rawPreMarketUpDays = {};
    const rawPreMarketDownDays = {};

    let upDaysCount = 0;
    let downDaysCount = 0;
    let totalCumulativeUpVolumeToHighTime = 0;
    let totalCumulativeDownVolumeToLowTime = 0;


    let aggregateVolumeUpDaysFirstHour = 0;
    let aggregateVolumeDownDaysFirstHour = 0;



    Object.keys(daysData).forEach(dateKey =>
    {
        const dayCandles = daysData[dateKey];
        dayCandles.sort((a, b) => a.timeKey.localeCompare(b.timeKey));

        const initialCandle = dayCandles.find(c => c.timeKey === "09:30");
        const bufferCandle = dayCandles.find(c => c.timeKey === "09:40");

        if (!initialCandle || !bufferCandle) return;

        // 15-Minute Opening Range Buffer establishes the day's structural direction
        const isTrueUpOpen = bufferCandle.close >= initialCandle.open;

        const mainHourMap = isTrueUpOpen ? rawUpDays : rawDownDays;
        const preMarketMap = isTrueUpOpen ? rawPreMarketUpDays : rawPreMarketDownDays;

        if (isTrueUpOpen)
        {
            upDaysCount++;
            dayCandles.forEach(c =>
            {
                aggregateVolumeUpDaysFirstHour += c.volume; // Tally regular session hour total

                if (c.timeKey >= "09:30" && c.minutes <= targetHighMinutes) totalCumulativeUpVolumeToHighTime += c.volume;
            });
        } else
        {
            downDaysCount++;
            dayCandles.forEach(c =>
            {
                aggregateVolumeDownDaysFirstHour += c.volume; // Tally regular session hour total

                if (c.timeKey >= "09:30" && c.minutes <= targetLowMinutes) totalCumulativeDownVolumeToLowTime += c.volume;
            });
        }

        // Distribute candles to their respective market-session containers
        dayCandles.forEach(candle =>
        {
            if (candle.timeKey < "09:30")
            {
                // Determine which 30-minute block bucket this pre-market candle belongs to
                // Math.floor(minutes / 30) gives us a distinct block index per hour
                const blockHour = Math.floor(candle.minutes / 30) * 30;
                if (!preMarketMap[blockHour])
                {

                    preMarketMap[blockHour] = { totalVolume: 0, count: 0 };
                }

                preMarketMap[blockHour].totalVolume += candle.volume;
                preMarketMap[blockHour].count++;
            } else
            {
                if (!mainHourMap[candle.timeKey])
                {
                    mainHourMap[candle.timeKey] = { totalVolume: 0, count: 0 };
                }
                mainHourMap[candle.timeKey].totalVolume += candle.volume;
                mainHourMap[candle.timeKey].count++;
            }
        });
    });

    // Helper to compile the original opening hour 5-min and 10-min pure data arrays
    const compileOpeningHourArrays = (rawMap) =>
    {
        const chronologicalTimeKeys = [
            "09:30", "09:35", "09:40", "09:45", "09:50", "09:55",
            "10:00", "10:05", "10:10", "10:15", "10:20", "10:25", "10:30"
        ];

        const fiveMinuteSegmentsArray = chronologicalTimeKeys.map(key =>
        {
            const dataPoint = rawMap[key];
            return dataPoint ? Math.round(dataPoint.totalVolume / dataPoint.count) : 0;
        });

        const tenMinuteBlocksArray = [
            fiveMinuteSegmentsArray[0] + fiveMinuteSegmentsArray[1], // 09:30-09:40
            fiveMinuteSegmentsArray[2] + fiveMinuteSegmentsArray[3], // 09:40-09:50
            fiveMinuteSegmentsArray[4] + fiveMinuteSegmentsArray[5], // 09:50-10:00
            fiveMinuteSegmentsArray[6] + fiveMinuteSegmentsArray[7], // 10:00-10:10
            fiveMinuteSegmentsArray[8] + fiveMinuteSegmentsArray[9], // 10:10-10:20
            fiveMinuteSegmentsArray[10] + fiveMinuteSegmentsArray[11] // 10:20-10:30
        ];

        return {
            fiveMinuteSegments: fiveMinuteSegmentsArray,
            tenMinuteBlocks: tenMinuteBlocksArray
        };
    };

    const compilePureArrays = (rawMap) =>
    {
        const chronologicalTimeKeys = [
            "09:30", "09:35", "09:40", "09:45", "09:50", "09:55",
            "10:00", "10:05", "10:10", "10:15", "10:20", "10:25", "10:30"
        ];

        const fiveMinuteSegmentsArray = chronologicalTimeKeys.map(key =>
        {
            const dataPoint = rawMap[key];
            return dataPoint ? Math.round(dataPoint.totalVolume / dataPoint.count) : 0;
        });

        const tenMinuteBlocksArray = [
            fiveMinuteSegmentsArray[0] + fiveMinuteSegmentsArray[1],
            fiveMinuteSegmentsArray[2] + fiveMinuteSegmentsArray[3],
            fiveMinuteSegmentsArray[4] + fiveMinuteSegmentsArray[5],
            fiveMinuteSegmentsArray[6] + fiveMinuteSegmentsArray[7],
            fiveMinuteSegmentsArray[8] + fiveMinuteSegmentsArray[9],
            fiveMinuteSegmentsArray[10] + fiveMinuteSegmentsArray[11]
        ];

        return {
            fiveMinutes: fiveMinuteSegmentsArray,
            tenMinutes: tenMinuteBlocksArray
        };
    };

    // Helper to compile the new 11-element pre-market 30-minute block array
    const compilePreMarketArray = (preMarketRawMap) =>
    {
        // Absolute starting minute coordinates for each 30-min block from 4:00 AM to 9:00 AM
        const preMarketBlockMinutes = [
            240, 270, 300, 330, 360, 390, 420, 450, 480, 510, 540
        ];

        // Maps directly to a clean 11-element sequence array of pure integers
        return preMarketBlockMinutes.map(minuteKey =>
        {
            const blockData = preMarketRawMap[minuteKey];
            return blockData ? Math.round(blockData.totalVolume / blockData.count) : 0;
        });
    };



    let upOpeningDaysProfile = compilePureArrays(rawUpDays)
    let downOpeningDaysProfile = compilePureArrays(rawDownDays)

    return {
        avgUpTotalVolToFirstHour: upDaysCount === 0 ? 0 : Math.round(aggregateVolumeUpDaysFirstHour / upDaysCount),
        avgDownTotalVolToFirstHour: downDaysCount === 0 ? 0 : Math.round(aggregateVolumeDownDaysFirstHour / downDaysCount),
        upOpenDays: upDaysCount,
        downOpenDays: downDaysCount,
        avgUpVolToHighTime: upDaysCount === 0 ? 0 : Math.round(totalCumulativeUpVolumeToHighTime / upDaysCount),
        avgDownVolToLowTime: downDaysCount === 0 ? 0 : Math.round(totalCumulativeDownVolumeToLowTime / downDaysCount),
        fiveMinUpDay: upOpeningDaysProfile.fiveMinutes,
        tenMinUpDay: upOpeningDaysProfile.tenMinutes,
        fiveMinDownDay: downOpeningDaysProfile.fiveMinutes,
        tenMinDownDay: downOpeningDaysProfile.tenMinutes,
        preMarketUpThirtyMinBlocks: compilePreMarketArray(rawPreMarketUpDays),
        preMarketDownThirtyMinBlocks: compilePreMarketArray(rawPreMarketDownDays)
    };


}




















































/**
 * Dynamically parses the Alpaca option symbol from right to left using RegEx.
 */
function parseAlpacaSymbol(symbol)
{
    if (!symbol) return null;
    const match = symbol.match(/(\d{6})([CP])(\d{8})$/);
    if (!match) return null;

    return {
        expiration: match[1],
        type: match[2] === 'C' ? 'CALL' : 'PUT',
        strike: parseFloat(match[3]) / 1000
    };
}

/**
 * Finds the nearest expiration date present in the array.
 */
function getNearestValidExpiration(chainArray)
{
    const validDates = chainArray
        .map(item =>
        {
            if (!item || !item.Symbol || !item.Greeks || typeof item.Greeks.gamma !== 'number' || isNaN(item.Greeks.gamma))
            {
                return null;
            }
            const parsed = parseAlpacaSymbol(item.Symbol);
            return parsed ? parsed.expiration : null;
        })
        .filter(Boolean);

    if (validDates.length === 0) return null;
    return [...new Set(validDates)].sort((a, b) => parseInt(a) - parseInt(b))[0];
}

/**
 * Calculates Primary and Secondary Call/Put Walls based on Gamma Concentrations [1, 2]
 */
function calculateMorningWalls(chainArray)
{
    if (!Array.isArray(chainArray) || chainArray.length === 0)
    {
        console.error("❌ Error: Input array is empty or invalid.");
        return null;
    }

    const targetExp = getNearestValidExpiration(chainArray);
    if (!targetExp)
    {
        console.error("❌ Error: No valid options data with computed Greeks found.");
        return null;
    }

    // Tracking structure for CALLS
    let maxCallGamma = -1;
    let callWallPrice = null;
    let secondMaxCallGamma = -1;
    let secondCallWallPrice = null;

    // Tracking structure for PUTS
    let maxPutGamma = -1;
    let putWallPrice = null;
    let secondMaxPutGamma = -1;
    let secondPutWallPrice = null;

    chainArray.forEach((contract) =>
    {
        if (!contract || !contract.Symbol) return;

        const parsed = parseAlpacaSymbol(contract.Symbol);
        if (!parsed || parsed.expiration !== targetExp) return;

        if (!contract.Greeks || typeof contract.Greeks.gamma !== 'number' || isNaN(contract.Greeks.gamma))
        {
            return;
        }

        const gamma = Math.abs(contract.Greeks.gamma);
        const strike = parsed.strike;

        // --- EVALUATE CALLS ---
        if (parsed.type === 'CALL')
        {
            if (gamma > maxCallGamma)
            {
                // Shift current primary down to secondary ONLY if it doesn't create an invalid duplicate
                if (callWallPrice !== putWallPrice)
                {
                    secondMaxCallGamma = maxCallGamma;
                    secondCallWallPrice = callWallPrice;
                }
                maxCallGamma = gamma;
                callWallPrice = strike;
            } else if (gamma > secondMaxCallGamma && strike !== callWallPrice && strike !== putWallPrice)
            {
                // CRITICAL FIX: Secondary Call strike cannot be the same as the Call Wall OR the Put Wall
                secondMaxCallGamma = gamma;
                secondCallWallPrice = strike;
            }
        }
        // --- EVALUATE PUTS ---
        else if (parsed.type === 'PUT')
        {
            if (gamma > maxPutGamma)
            {
                if (putWallPrice !== callWallPrice)
                {
                    secondMaxPutGamma = maxPutGamma;
                    secondPutWallPrice = putWallPrice;
                }
                maxPutGamma = gamma;
                putWallPrice = strike;
            } else if (gamma > secondMaxPutGamma && strike !== putWallPrice && strike !== callWallPrice)
            {
                // CRITICAL FIX: Secondary Put strike cannot be the same as the Put Wall OR the Call Wall
                secondMaxPutGamma = gamma;
                secondPutWallPrice = strike;
            }
        }
    });


    return {
        dateId: targetExp,
        walls: {
            primary: {
                callWall: callWallPrice,
                putWall: putWallPrice
            },
            secondary: {
                callWall: secondCallWallPrice,
                putWall: secondPutWallPrice
            }
        }
    };
}



module.exports = {
    calculateEMADataPoints, calculateCurrentSingleRSI, calculateATR,
    calculateExtendedSessionProbabilities, calculateCompleteMorningMetrics,
    calculateCorrelation, seedHistoricalOpeningHourVolume, calculateMorningWalls, seedHistoricalVolumeWithPreMarket
}