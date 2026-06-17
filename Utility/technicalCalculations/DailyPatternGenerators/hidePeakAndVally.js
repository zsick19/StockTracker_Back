/**
 * Programmatic Peak & Valley Extraction Engine.
 * Automatically maps structural turning points from a baseline starting date [INDEX].
 * 
 * @param {Array} dailyCandles - Complete array of daily candles from your RTK cache [{ Timestamp, HighPrice, LowPrice, ClosePrice }]
 * @param {string} patternStartDate - The ISO/Date string where your macro pattern begins
 * @returns {Array} Clean, auto-tagged chronological pivots ready for target projection [INDEX]
 */
function extractPivotsFromStartDate(dailyCandles, patternStartDate) {
    if (!dailyCandles || dailyCandles.length < 5) return [];

    // 1. Filter out daily candles that occurred before your pattern start date [INDEX]
    const targetTimestampFloor = new Date(patternStartDate).getTime();
    const relevantHistory = dailyCandles.filter(c => new Date(c.Timestamp).getTime() >= targetTimestampFloor)
                                        .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

    if (relevantHistory.length < 3) return [];

    // 2. Establish a Dynamic Volatility Filter
    // Calculates average daily range (High - Low) over the slice to set a minimum turning threshold
    const avgDailyRange = relevantHistory.reduce((sum, c) => sum + (c.HighPrice - c.LowPrice), 0) / relevantHistory.length;
    const reversalThreshold = avgDailyRange * 1.5; // Price must reverse by this amount to confirm a new structural pivot

    const extractedPivots = [];
    
    // Initialize our tracking state with the first day's price boundaries
    let isSearchingForPeak = relevantHistory[1].ClosePrice > relevantHistory[0].ClosePrice;
    let lastPivotPrice = isSearchingForPeak ? relevantHistory[0].LowPrice : relevantHistory[0].HighPrice;
    let lastPivotDate = relevantHistory[0].Timestamp.split('T')[0];

    extractedPivots.push({
        date: lastPivotDate,
        price: lastPivotPrice,
        type: isSearchingForPeak ? "VALLEY" : "PEAK"
    });

    // 3. Run the ZigZag Extraction Loop over the daily timeline
    for (let i = 1; i < relevantHistory.length; i++) {
        const candle = relevantHistory[i];

        if (isSearchingForPeak) {
            // If the stock keeps climbing, slide our peak candidate higher
            if (candle.HighPrice > lastPivotPrice) {
                lastPivotPrice = candle.HighPrice;
                lastPivotDate = candle.Timestamp.split('T')[0];
            }
            // If price drops beneath our peak by more than our volatility threshold, lock it in!
            else if (lastPivotPrice - candle.LowPrice >= reversalThreshold) {
                extractedPivots.push({ date: lastPivotDate, price: lastPivotPrice, type: "PEAK" });
                // Switch states to search for the bottom valley candidate
                isSearchingForPeak = false;
                lastPivotPrice = candle.LowPrice;
                lastPivotDate = candle.Timestamp.split('T')[0];
            }
        } else {
            // If the stock keeps falling, slide our valley candidate lower
            if (candle.LowPrice < lastPivotPrice) {
                lastPivotPrice = candle.LowPrice;
                lastPivotDate = candle.Timestamp.split('T')[0];
            }
            // If price bounces off the bottom by more than our threshold, lock in the valley!
            else if (candle.HighPrice - lastPivotPrice >= reversalThreshold) {
                extractedPivots.push({ date: lastPivotDate, price: lastPivotPrice, type: "VALLEY" });
                isSearchingForPeak = true;
                lastPivotPrice = candle.HighPrice;
                lastPivotDate = candle.Timestamp.split('T')[0];
            }
        }
    }

    // 4. Force append the most recent active candle as our final "Floating Candidate" [INDEX]
    // This allows your nightly script to scale the final leg higher or lower every evening [INDEX]
    const finalCandle = relevantHistory[relevantHistory.length - 1];
    const finalDateStr = finalCandle.Timestamp.split('T')[0];

    if (extractedPivots[extractedPivots.length - 1].date !== finalDateStr) {
        extractedPivots.push({
            date: finalDateStr,
            price: isSearchingForPeak ? finalCandle.HighPrice : finalCandle.LowPrice,
            type: isSearchingForPeak ? "PEAK" : "VALLEY"
        });
    }

    return extractedPivots;
}
