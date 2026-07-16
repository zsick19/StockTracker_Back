const { isBefore, isAfter, differenceInBusinessDays } = require('date-fns');

function processBackTests(entryPrice, exitPrice, stopLossPrice, stock, candleData)
{
    let entryTriggered = []
    candleData.forEach((t, i) =>
    {

        if (isAfter(t.Timestamp, stock.relevantCandleDate) && entryPrice < t.HighPrice && entryPrice > t.LowPrice) entryTriggered.push({
            tradeDate: t.Timestamp,
            range: `${t.LowPrice} - ${t.HighPrice}`,
            entryPrice,
            exitPrice,
            stopLossPrice,
            ticker: t.Symbol
        })
    })


    let totalClosedTrades = 0
    let totalClosedTradesSinceTracking = 0
    let patternLength = differenceInBusinessDays(new Date(), stock.relevantCandleDate)


    if (entryTriggered.length === 0) return {
        backTests: [],
        averages: {}
    }

    const floatTo2Digits = (number) => { return parseFloat(number.toFixed(2)) }
    const numberOfSharesWith1000 = Math.floor(1000 / entryPrice)


    const backTestedTrades = entryTriggered.map((t, i) =>
    {
        let wasStopHit = false
        let lowestValue = entryPrice
        let dateOfLowestValue = t.tradeDate
        let dateOfHighestValue = t.tradeDate
        let highestValue = entryPrice
        let wasExitHit = false
        let holdTillDate = t.tradeDate
        let holdToClose = undefined


        for (const k of candleData)
        {
            if (isAfter(k.Timestamp, t.tradeDate))
            {
                holdTillDate = k.Timestamp
                holdToClose = differenceInBusinessDays(k.Timestamp, t.tradeDate)

                if (k.LowPrice < lowestValue)
                {
                    dateOfLowestValue = k.Timestamp
                    lowestValue = k.LowPrice
                }
                if (k.HighPrice > highestValue)
                {
                    dateOfHighestValue = k.Timestamp
                    highestValue = k.HighPrice
                }
                if (k.LowPrice < stopLossPrice) wasStopHit = true
                if (k.HighPrice >= exitPrice)
                {
                    wasExitHit = true
                    totalClosedTrades += 1
                    if (isAfter(k.Timestamp, stock.dateAdded)) { totalClosedTradesSinceTracking += 1 }
                    break;
                }
            }
        }


        return {
            details: {
                wasExitHit,
                wasStopHit,
                tradeDate: t.tradeDate,
                holdDays: holdToClose,
                closeOrHoldTillDate: holdTillDate,
            },
            gain: {
                maxGain: floatTo2Digits(((highestValue - entryPrice) * numberOfSharesWith1000)),
                missedGain: wasExitHit ? floatTo2Digits(((highestValue - exitPrice) * numberOfSharesWith1000)) : 0,
                highestValue,
                dateOfHighestValue,
                highestValuePercent: floatTo2Digits(((highestValue - entryPrice) * 100 / entryPrice)),
            },
            pain: {
                maxPain: floatTo2Digits(((entryPrice - lowestValue) * numberOfSharesWith1000)),
                avoidedPain: wasStopHit ? floatTo2Digits(((stopLossPrice - lowestValue) * numberOfSharesWith1000)) : 0,
                lowestValue,
                dateOfLowestValue,
                lowestValuePercent: floatTo2Digits(((entryPrice - lowestValue) * 100 / entryPrice)),
            }
        }
    })

    let avgHoldTime = 0
    let avgMaxPain = 0
    let avgGainPercent = 0
    let avgMaxGain = 0
    let avgPainPercent = 0
    let numberOfClosedTrades = 0
    let numberOfStoplossHitTrades = 0
    let avgMissedGain = 0
    let avgSavedPain = 0

    let mGain = 0
    let mPain = 0

    let countSinceTracking = 0
    let successfulOpportunitiesSinceTracking = 0
    let businessDaysBetweenTrades = []
    let businessDaysBetweenSuccessfulTrades = []


    let lowestPatternValue = entryPrice
    let highestPatternValue = entryPrice

    backTestedTrades.forEach(t =>
    {
        if (isAfter(t.details.tradeDate, stock.dateAdded))
        {
            countSinceTracking += 1
            if (t.details.wasExitHit) successfulOpportunitiesSinceTracking += 1
        }

        if (t.details.wasExitHit)
        {
            avgHoldTime += t.details.holdDays
            numberOfClosedTrades += 1
            avgMissedGain += t.gain.missedGain
            businessDaysBetweenSuccessfulTrades.push(differenceInBusinessDays(t.details.tradeDate, new Date()))
        }

        if (t.details.wasStopHit)
        {
            avgSavedPain += t.pain.avoidedPain
            numberOfStoplossHitTrades += 1
        }

        if (t.gain.highestValue > highestPatternValue) highestPatternValue = t.gain.highestValue
        if (t.pain.lowestValue < lowestPatternValue) lowestPatternValue = t.pain.lowestValue

        if (t.gain.maxGain > mGain) mGain = t.gain.maxGain
        if (t.pain.maxPain > mPain) mPain = t.pain.maxPain

        avgMaxGain += t.gain.maxGain
        avgGainPercent += t.gain.highestValuePercent

        avgMaxPain += t.pain.maxPain
        avgPainPercent += t.pain.lowestValuePercent

        businessDaysBetweenTrades.push(differenceInBusinessDays(t.details.tradeDate, new Date()))
    })

    let daysBetweenTrades = businessDaysBetweenTrades.slice(0, -1).map((num, i) => businessDaysBetweenTrades[i + 1] - num)
    let daysBetweenSuccessfulTrades = businessDaysBetweenSuccessfulTrades.slice(0, -1).map((num, i) => businessDaysBetweenSuccessfulTrades[i + 1] - num)


    const numberOfBackTestedTrades = backTestedTrades.length
    const averagesFromBackTesting = {
        averageHoldTime: numberOfClosedTrades > 0 ? floatTo2Digits(avgHoldTime / numberOfClosedTrades) : 0,
        averageMaxGain: floatTo2Digits(avgMaxGain / numberOfBackTestedTrades),
        averageGainPercent: floatTo2Digits(avgGainPercent / numberOfBackTestedTrades),
        averageMaxPain: floatTo2Digits(avgMaxPain / numberOfBackTestedTrades),
        averagePainPercent: floatTo2Digits(avgPainPercent / numberOfBackTestedTrades),
        averageMissGain: numberOfClosedTrades > 0 ? floatTo2Digits(avgMissedGain / numberOfClosedTrades) : 0,
        averageSavedPain: numberOfStoplossHitTrades > 0 ? floatTo2Digits(avgSavedPain / numberOfStoplossHitTrades) : 0,

        totalNumberOfTrades: numberOfBackTestedTrades,
        numberOfStoplossHitTrades,
        numberOfClosedTrades,
        numberOfOpenTrades: numberOfBackTestedTrades - numberOfClosedTrades,

        tradesSinceTracking: countSinceTracking,
        successfulOpportunitiesSinceTracking,
        patternLength,
        daysBetweenTrades: daysBetweenTrades,
        daysBetweenSuccessfulTrades: daysBetweenSuccessfulTrades,
        averageDaysBetweenTrades: daysBetweenTrades.length > 0 ? floatTo2Digits(daysBetweenTrades.reduce((sum, num) => sum + num, 0) / daysBetweenTrades.length) : 0,
        averageDaysBetweenSuccessfulTrades: daysBetweenSuccessfulTrades.length > 0 ? floatTo2Digits(daysBetweenSuccessfulTrades.reduce((sum, num) => sum + num, 0) / daysBetweenSuccessfulTrades.length) : 0,
        patternMaxPain: mPain,
        patternMaxGain: mGain,
        positionReward: floatTo2Digits((exitPrice - entryPrice) * numberOfSharesWith1000),
        positionRisk: floatTo2Digits((entryPrice - stopLossPrice) * numberOfSharesWith1000),
        lowestPatternValue,
        highestPatternValue
    }

    return {
        backTests: backTestedTrades,
        averages: averagesFromBackTesting
    }
}

module.exports = { processBackTests }