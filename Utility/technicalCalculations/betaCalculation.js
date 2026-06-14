
/**
* Optimized Nightly Beta Calculator Engine.
* Automatically limits calculation to a strict 90-day trading horizon,
* skipping any excess data points left in the 180-day input array.
* 
* @param {Array} stockDailyCandles - Array of daily candles: [{ ClosePrice, Timestamp }, ...]
* @param {Array} marketDailyCandles - Array of index daily candles (e.g., SPY): [{ ClosePrice, Timestamp }, ...]
* @param {number} lookbackDays - Total trading sessions to calculate over (Default: 90 days)
* @returns {Object} Clean database-ready update payload
*/
function calculateNightlyBeta(stockDailyCandles, marketDailyCandles, lookbackDays = 90)
{
    if (!stockDailyCandles || !marketDailyCandles || stockDailyCandles.length < 2)
    {
        return { success: false, error: "Insufficient daily historical datasets provided." };
    }

    // 1. Build a dictionary of the market benchmark data indexed by date
    const marketPriceMap = {};
    marketDailyCandles.forEach(candle =>
    {
        const dateKey = candle.Timestamp.split('T');
        marketPriceMap[dateKey] = candle.ClosePrice;
    });

    const synchronizedReturnPairs = [];

    // 2. Scan backward from the most recent closing candle.
    // Break the loop the moment we collect our required lookback days, skipping the rest.
    for (let i = stockDailyCandles.length - 1; i >= 1; i--)
    {
        if (synchronizedReturnPairs.length >= lookbackDays)
        {
            break; // Performance Skip: Ignore all older candles in the 180-day array
        }

        const currentStockCandle = stockDailyCandles[i];
        const previousStockCandle = stockDailyCandles[i - 1];

        const currentDateKey = currentStockCandle.Timestamp.split('T');
        const prevDateKey = previousStockCandle.Timestamp.split('T');

        if (marketPriceMap[currentDateKey] && marketPriceMap[prevDateKey])
        {
            const stockDailyReturn = (currentStockCandle.ClosePrice - previousStockCandle.ClosePrice) / previousStockCandle.ClosePrice;
            const marketDailyReturn = (marketPriceMap[currentDateKey] - marketPriceMap[prevDateKey]) / marketPriceMap[prevDateKey];

            synchronizedReturnPairs.push({
                stockReturn: stockDailyReturn,
                marketReturn: marketDailyReturn
            });
        }
    }

    const sampleSize = synchronizedReturnPairs.length;
    if (sampleSize < 20)
    {
        return { success: false, error: `Insufficient synchronized dates. Paired only ${sampleSize} days.` };
    }

    // 3. Compute Averages
    const avgStockReturn = synchronizedReturnPairs.reduce((sum, p) => sum + p.stockReturn, 0) / sampleSize;
    const avgMarketReturn = synchronizedReturnPairs.reduce((sum, p) => sum + p.marketReturn, 0) / sampleSize;

    // 4. Compute Covariance and Market Variance [INDEX]
    let covarianceSum = 0;
    let marketVarianceSum = 0;

    synchronizedReturnPairs.forEach(pair =>
    {
        const stockDeviation = pair.stockReturn - avgStockReturn;
        const marketDeviation = pair.marketReturn - avgMarketReturn;

        covarianceSum += (stockDeviation * marketDeviation);
        marketVarianceSum += (marketDeviation * marketDeviation);
    });

    if (marketVarianceSum === 0)
    {
        return { success: true, betaValue: 1.0, dataPointsUsed: sampleSize, status: "DEFAULT_FLAT_MARKET" };
    }

    const finalCovariance = covarianceSum / (sampleSize - 1);
    const finalMarketVariance = marketVarianceSum / (sampleSize - 1);

    // 5. Beta = Covariance / Variance [INDEX]
    const calculatedBeta = finalCovariance / finalMarketVariance;

    return parseFloat(calculatedBeta.toFixed(2));
}

module.exports = { calculateNightlyBeta }