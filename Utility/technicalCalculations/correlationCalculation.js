/**
 * Calculates simultaneous 30-day and 90-day Pearson Correlation Coefficients ($r$) [INDEX].
 * Optimizes performance by truncating excess data beyond the maximum required lookback.
 * 
 * @param {Array} stockDailyCandles - Array of daily candles: [{ ClosePrice, Timestamp }, ...]
 * @param {Array} sectorDailyCandles - Array of sector index daily candles (e.g., XLK): [{ ClosePrice, Timestamp }, ...]
 * @returns {Object} Database-ready correlation update payload
 */
function calculateNightlyCorrelation(stockDailyCandles, sectorDailyCandles)
{
    if (!stockDailyCandles || !sectorDailyCandles || stockDailyCandles.length < 2) { return { success: false, error: "Insufficient daily datasets provided." }; }

    // 1. Build a dictionary of sector prices indexed by exact date for timestamp alignment [INDEX]
    const sectorPriceMap = {};
    sectorDailyCandles.forEach(candle =>
    {
        const dateKey = candle.Timestamp.split('T');
        sectorPriceMap[dateKey] = candle.ClosePrice;
    });

    const synchronizedReturns = [];

    // 2. Loop backward from the most recent closing candle.
    // The maximum horizon we care about is 90 trading days. 
    // We stop pulling data points once we hit 90 matched rows, skipping the rest of the 180-day array.
    for (let i = stockDailyCandles.length - 1; i >= 1; i--)
    {
        if (synchronizedReturns.length >= 90) { break; }
        // Performance Skip: Ignore all remaining older candles automatically

        const currentStock = stockDailyCandles[i];
        const prevStock = stockDailyCandles[i - 1];

        const currentDateKey = currentStock.Timestamp.split('T');
        const prevDateKey = prevStock.Timestamp.split('T');

        // Verify the exact matching days exist inside the sector ETF data array [INDEX]
        if (sectorPriceMap[currentDateKey] && sectorPriceMap[prevDateKey])
        {
            // Calculate daily percentage returns
            const stockReturn = (currentStock.ClosePrice - prevStock.ClosePrice) / prevStock.ClosePrice;
            const sectorReturn = (sectorPriceMap[currentDateKey] - sectorPriceMap[prevDateKey]) / sectorPriceMap[prevDateKey];

            synchronizedReturns.push({ stockReturn, sectorReturn });
        }
    }

    // Safety Gate: Ensure we successfully aligned enough sessions to build a valid baseline
    if (synchronizedReturns.length < 30)
    {
        return {
            success: false,
            error: `Failed to synchronize dates. Aligned only ${synchronizedReturns.length} matching trading days.`
        };
    }

    // 3. Helper to calculate Pearson Correlation over a specific subset of our matched data [INDEX]
    const computePearsonCorrelation = (dataSlice) =>
    {
        const n = dataSlice.length;

        // Sum components required for the Pearson formula [INDEX]
        let sumX = 0, sumY = 0, sumXY = 0;
        let sumX2 = 0, sumY2 = 0;

        dataSlice.forEach(pair =>
        {
            const x = pair.stockReturn;
            const y = pair.sectorReturn;

            sumX += x;
            sumY += y;
            sumXY += (x * y);
            sumX2 += (x * x);
            sumY2 += (y * y);
        });

        // Pearson Correlation Coefficient ($r$) formula denominator [INDEX]
        const numerator = (n * sumXY) - (sumX * sumY);
        const denominator = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));

        if (denominator === 0) return 0.0;
        return parseFloat((numerator / denominator).toFixed(2));
    };

    // 4. Extract the exact slices from our synchronized tracking array
    // Since we scanned backward, index 0 to 29 represents the most recent 30 trading days
    const slice30Day = synchronizedReturns.slice(0, 30);
    // The entire array is already bounded to a maximum size of 90 matching entries
    const slice90Day = synchronizedReturns;

    const r30Day = computePearsonCorrelation(slice30Day);
    const r90Day = computePearsonCorrelation(slice90Day);

    return {
        correlation30Day: r30Day,
        correlation90Day: r90Day,
        isCoreCoIntegrationValid: r90Day >= 0.65, // True if long-term structural relationship exists
        isCurrentlyDecoupled: r90Day >= 0.65 && r30Day < 0.40 // Flags idiosyncratic moving assets
    };
}

module.exports = { calculateNightlyCorrelation }