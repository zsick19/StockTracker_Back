import { parseISO } from 'date-fns';

/**
 * PRODUCTION COMPILER: compileChannelHistoricalAbsorptionWindow
 * Ingests a standardized 1-minute candlestick dataset to calculate how many consecutive
 * minutes a stock remains tradable within your strategy entry strike zone box [INDEX].
 * 
 * @param {Array} incoming1MinBars - Raw 1-minute bars array from your 5-day batch Alpaca call [INDEX]
 * @param {Object} planEntity - Core plan document from MongoDB holding your entry channel rules [INDEX]
 * @returns {Object} Extracted duration metrics ready to update your database collection indicators [INDEX]
 */
export function compileChannelHistoricalAbsorptionWindow(incoming1MinBars, planEntity)
{
    const channelConfig = planEntity.channelPattern || {};
    const entryBufferCeiling = channelConfig.entryStrikeBuffer || 0;
    const supportFloor = channelConfig.channelBottom || 0;

    // Hard fallback layout schema if data loops fail or anchors aren't initialized [INDEX]
    const defaultStrategyFallback = {
        averageMinutesInStrikeZone: 15.0, // Stable large-cap default placeholder pool [INDEX]
        maxConsecutiveMinutesInZone: 12,
        executionVelocityRating: "STABLE_ACCUMULATION",
        entryBufferCeiling, supportFloor

    };

    if (supportFloor === 0 || entryBufferCeiling === 0) return defaultStrategyFallback;

    // =========================================================================
    // STEP A: ISOLATE THE ACTIVE TIMEFRAME DATAFRAME ARRAY
    // =========================================================================
    let targetCandlesToAnalyze = [];

    if (incoming1MinBars && incoming1MinBars.length > 0)
    {
        targetCandlesToAnalyze = incoming1MinBars;
    } else
    {
        // 🔍 ADVANCED FALLBACK GATING:
        // If your rolling 3-day batch download returned 0 touches or holds no data,
        // fallback to using the pre-existing candles saved on the document object [INDEX]!
        console.log(`ℹ️ Absorption Sentry [${planEntity.tickerSymbol}]: No new data array provided. Cascading to older historical candles cache [INDEX].`);
        targetCandlesToAnalyze = planEntity.historicalCandles || [];
    }

    if (targetCandlesToAnalyze.length === 0) return defaultStrategyFallback;

    // =========================================================================
    // STEP B: ENFORCE REGULAR TRADING HOURS ONLY (09:30 AM - 04:00 PM EST)
    // =========================================================================
    // Removes volatile pre-market gaps and after-hours noise to keep stats pure [INDEX]
    const cleanRthCandles = targetCandlesToAnalyze.filter(candle =>
    {
        // Account for different possible naming keys back from database vs raw Alpaca payload [INDEX]
        const rawTimestamp = candle.Timestamp || candle.t || candle.timestamp;
        if (!rawTimestamp) return false;

        const dateObj = new Date(rawTimestamp);
        const nyTimeStr = dateObj.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
        return nyTimeStr >= "09:30:00" && nyTimeStr <= "16:00:00";
    });

    if (cleanRthCandles.length === 0) return defaultStrategyFallback;

    let currentConsecutiveMinutesInsideZone = 0;
    let maxConsecutiveMinutesInsideZone = 0;
    let totalAccumulatedMinutesInZone = 0;
    let totalIndependentZoneTouchesCount = 0;
    let wasInsideZoneOnPriorBar = false;

    // =========================================================================
    // STEP C: CHRONONLOGICAL TIME-SERIES INTERACTION LOOP
    // =========================================================================
    cleanRthCandles.forEach(candle =>
    {
        const closePrice = candle.ClosePrice || candle.c; // Support database vs raw Alpaca keys [INDEX]

        // Audit if the 1-minute close printed inside your entry strike zone box [INDEX]
        const isPriceInsideZone = closePrice >= supportFloor && closePrice <= entryBufferCeiling;

        if (isPriceInsideZone)
        {
            totalAccumulatedMinutesInZone++;
            currentConsecutiveMinutesInsideZone++;

            // Register a fresh, independent institutional absorption event
            if (!wasInsideZoneOnPriorBar)
            {
                totalIndependentZoneTouchesCount++;
                wasInsideZoneOnPriorBar = true;
            }

            if (currentConsecutiveMinutesInsideZone > maxConsecutiveMinutesInsideZone)
            {
                maxConsecutiveMinutesInsideZone = currentConsecutiveMinutesInsideZone;
            }
        } else
        {
            // Price broke away or flushed out; reset your continuous counter clock
            currentConsecutiveMinutesInsideZone = 0;
            wasInsideZoneOnPriorBar = false;
        }
    });

    // =========================================================================
    // STEP D: COMPILE RESOLVED TIME COEFFICIENTS
    // =========================================================================
    // If we completed our pass over the rolling data and found exactly 0 touches,
    // cascade safely to your strategy-type default values to prevent loading blank fields [INDEX]
    if (totalIndependentZoneTouchesCount === 0)
    {
        console.log(`⚠️ Absorption Sentry [${planEntity.tickerSymbol}]: 0 touches detected across active lookback. Instantiating default plan baselines.`);
        return defaultStrategyFallback;
    }

    const averageMinutesPerVisit = totalAccumulatedMinutesInZone / totalIndependentZoneTouchesCount;

    // If the average visit length is under 3 minutes, label it high speed [INDEX]

    return {
        averageMinutesInStrikeZone: parseFloat(averageMinutesPerVisit.toFixed(1)),
        maxConsecutiveMinutesInZone: maxConsecutiveMinutesInsideZone,
        executionVelocityRating: averageMinutesPerVisit <= 3.0 ? "HYPER_VELOCITY_SPRING" : "STABLE_ACCUMULATION",
        entryBufferCeiling, supportFloor
    };
}
