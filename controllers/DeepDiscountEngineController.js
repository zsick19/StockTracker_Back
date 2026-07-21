const EnterExitPlannedStock = require('../models/EnterExitPlannedStock');
const Alpaca = require('@alpacahq/alpaca-trade-api')
const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });
const asyncHandler = require("express-async-handler");
const { retryOperation } = require("../Utility/sharedUtility");
const { sendRabbitMessage, rabbitQueueNames } = require("../config/rabbitMQService");
const { subMinutes } = require('date-fns/subMinutes');
const { isAfter } = require('date-fns/isAfter');
const { set } = require('date-fns/set');




const initiateLiveQuoteAndFetchDailyData = asyncHandler(async (req, res) =>
{
    const { ticker, patternDate } = req.body
    if (!ticker || !patternDate || !req.userId) return res.status(400).send('Missing Request Information')

    try
    {
        await retryOperation(async () =>
        {
            const dailyPatternCandles = await alpaca.getBarsV2(ticker, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.DAY), start: patternDate })
            const candleData = []
            for await (let singleCandle of dailyPatternCandles) { candleData.push(singleCandle) }
            sendRabbitMessage(req, res, rabbitQueueNames.liveQuotesSubscribe, {
                action: 'liveQuoteData', tickerSymbol: ticker,
                userId: req.userId, isAddingQuote: true
            })

            res.json({ dailyCandleData: candleData })
        })
    } catch (error)
    {
        console.error('Error fetching data:', error);
        res.status(500).json({ message: 'error requesting stock data' })
    }
})

const clearLiveQuoteDeepDiscount = asyncHandler(async (req, res) =>
{
    const { ticker } = req.body
    if (!ticker || !req.userId) return res.status(400).send('Missing Request Information')
    sendRabbitMessage(req, res, rabbitQueueNames.liveQuotesSubscribe, { action: 'liveQuoteDat', tickerSymbol: ticker, userId: req.userId, isAddingQuote: false })
    res.json({ message: 'Ticker removed from quote stream.' })
})

const markPlanFullyDeepDiscountReviewed = asyncHandler(async (req, res) =>
{
    const { planId } = req.query
    if (!planId) return res.status(400).send('Missing Request Information')

    const foundPlan = await EnterExitPlannedStock.findById(planId)
    if (!foundPlan) return res.status(404).send('Record Not Found')
    let today = new Date()
    foundPlan.deepDiscounts.dateReviewed = today
    await foundPlan.save()
    res.json({ dateReviewed: today })
})

const fetchPastMinsOfTrades = asyncHandler(async (req, res) =>
{
    const { ticker } = req.query

    const oneMinTickers = [ticker]
    let startMin = subMinutes(new Date(), 3)
    let quoteSubMin = subMinutes(new Date(), 5)
    let end = new Date()

    if (isAfter(new Date(), set(new Date(), { hours: 16, minutes: 0, seconds: 0, milliseconds: 0 })))
    {
        startMin = set(new Date(), { hours: 15, minutes: 57, seconds: 0, milliseconds: 0 })
        quoteSubMin = set(new Date(), { hours: 15, minutes: 55, seconds: 0, milliseconds: 0 })
        end = set(new Date(), { hours: 16, minutes: 0, seconds: 0, milliseconds: 0 })
    }

    try
    {
        await retryOperation(async () =>
        {
            const [tData, qData] = await Promise.all([
                alpaca.getTradesV2(ticker, { start: startMin, end: end }),
                alpaca.getQuotesV2(ticker, { start: quoteSubMin, end: end })]
            )

            // const tradeData = await alpaca.getTradesV2(ticker, { start: startMin })
            const tickerData = []
            for await (let singleCandle of tData) { tickerData.push(singleCandle) }
            const quoteData = []
            for await (let singleCandle of qData) { quoteData.push(singleCandle) }

            // const tickerData = tradeData.get(ticker)
            console.log(new Date(startMin).toTimeString(), new Date(quoteSubMin).toTimeString())

            res.json({ trades: tickerData, quotes: quoteData })
        })
    } catch (error)
    {
        console.error('Error fetching data today candles:', error);
        res.status(500).json({ message: 'error requesting stock data' })
    }



})


const createOrUpdateDeepDiscountAlertToPlan = asyncHandler(async (req, res) =>
{
    const { planId, discountToUpdate, alertPrice, suggestedProfile } = req.body

    if (!planId || !discountToUpdate || !alertPrice || !suggestedProfile) return res.status(400).send('Missing Request Information')

    const foundPlan = await EnterExitPlannedStock.findById(planId)
    if (!foundPlan) return res.status(404).send('Record Not Found')

    let alertToPush = {
        price: parseFloat(alertPrice.toFixed(3)),
        dateSet: new Date(),
        profile: suggestedProfile
    }

    switch (discountToUpdate)
    {
        case 1: foundPlan.deepDiscounts.aboveStopLoss = alertToPush; break;
        case 2: foundPlan.deepDiscounts.belowStopLoss = alertToPush; break;
        case 3: foundPlan.deepDiscounts.aboveMaxPain = alertToPush; break;
    }
    await foundPlan.save()


    res.json(foundPlan.deepDiscounts)

})

const removeDeepDiscountAlertFromPlan = asyncHandler(async (req, res) =>
{
    const { planId, discountToRemove } = req.body

    if (!planId || !discountToRemove) return res.status(400).send('Missing Request Information')

    const foundPlan = await EnterExitPlannedStock.findById(planId)
    if (!foundPlan) return res.status(404).send('Record Not Found')


    switch (discountToRemove)
    {
        case 1: foundPlan.deepDiscounts.belowStopLoss = undefined; break;
        case 2: foundPlan.deepDiscounts.aboveStopLoss = undefined; break;
        case 3: foundPlan.deepDiscounts.aboveMaxPain = undefined; break;
    }

    await foundPlan.save()

    res.json({ discountToRemove })
})

const createOrUpdateExitAlertToPlan = asyncHandler(async (req, res) =>
{
    const { planId, exitPrice } = req.body

    if (!planId || !exitPrice) return res.status(400).send('Missing Request Information')

    const foundPlan = await EnterExitPlannedStock.findById(planId)
    if (!foundPlan) return res.status(404).send('Record Not Found')

    foundPlan.plan.exitAlertPrice = exitPrice

    await foundPlan.save()

    res.json(foundPlan.plan)

})

const removeExitAlertFromPlan = asyncHandler(async (req, res) =>
{
    const { planId } = req.body

    if (!planId) return res.status(400).send('Missing Request Information')

    const foundPlan = await EnterExitPlannedStock.findById(planId)
    if (!foundPlan) return res.status(404).send('Record Not Found')
    foundPlan.plan.exitAlertPrice = undefined


    await foundPlan.save()

    res.json(foundPlan.plan)
})




module.exports = {
    initiateLiveQuoteAndFetchDailyData,
    fetchPastMinsOfTrades,
    clearLiveQuoteDeepDiscount,
    createOrUpdateDeepDiscountAlertToPlan,
    removeDeepDiscountAlertFromPlan,
    markPlanFullyDeepDiscountReviewed,
    createOrUpdateExitAlertToPlan,
    removeExitAlertFromPlan
};
