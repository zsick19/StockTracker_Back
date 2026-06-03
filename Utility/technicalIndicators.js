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

module.exports = {
    calculateEMADataPoints, calculateCurrentSingleRSI, calculateATR
}