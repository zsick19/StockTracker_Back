

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


module.exports = { seedHistoricalVolumeWithPreMarket }