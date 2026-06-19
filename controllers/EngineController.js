const User = require("../models/User");
const EnterExitPlannedStock = require('../models/EnterExitPlannedStock');
const Alpaca = require('@alpacahq/alpaca-trade-api')
const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });
const asyncHandler = require("express-async-handler");
const { isWeekend, previousFriday, previousThursday, subBusinessDays, endOfYesterday, subMinutes } = require("date-fns");
const { retryOperation } = require("../Utility/sharedUtility");

const fetchHistoricalEngineData = asyncHandler(async (req, res) =>
{
    if (!req.userId) return res.status(400).send("missing information");
    const foundUser = await User.findById(req.userId).populate({ path: 'planAndTrackedStocks' }).select('planAndTrackedStocks -_id');
    if (!foundUser) res.status(404).json({ message: 'User not found.' })
    const fiveMinTickers = []
    const oneMinTickers = []
    const allPlans = []
    foundUser.planAndTrackedStocks.forEach((t) =>
    {
        allPlans.push(t.tickerSymbol)
        if (t?.maintainLiveCandles) oneMinTickers.push(t.tickerSymbol)
        else { fiveMinTickers.push(t.tickerSymbol) }
    })


    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const startDate = subBusinessDays(todayStart, 10)
    const threeDayStart = subBusinessDays(todayStart, 3)
    const yesterday = subBusinessDays(todayStart, 1)
    const startMin = subMinutes(new Date(), 2)

    try
    {
        await retryOperation(async () =>
        {
            const [snapShots, oneMinTradesData, oneMinData, fiveMinData] = await Promise.all([
                alpaca.getSnapshots(allPlans),
                alpaca.getMultiTradesV2(oneMinTickers, { start: startMin }),
                alpaca.getMultiBarsV2(oneMinTickers, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.MIN), start: threeDayStart, end: yesterday }),
                alpaca.getMultiBarsV2(fiveMinTickers, { timeframe: alpaca.newTimeframe(5, alpaca.timeframeUnit.MIN), start: startDate, end: yesterday })
            ])
            const candleData = {}
            for await (let singleStock of oneMinData) { candleData[singleStock[0]] = singleStock[1] }
            for await (let singleStock of fiveMinData) { candleData[singleStock[0]] = singleStock[1] }

            const jsonCompatible = Object.fromEntries(oneMinTradesData)


            let results = foundUser.planAndTrackedStocks.map((t) =>
            {
                let singleSnap = snapShots.find(ss => ss.symbol === t.tickerSymbol)
                return { plan: t, candleData: candleData[t.tickerSymbol], snapShot: singleSnap, tradeData: jsonCompatible[t.tickerSymbol] }
            })
            res.json(results);
        })
    } catch (error)
    {
        console.error('Error fetching data:', error);
        res.status(500).json({ message: 'error requesting stock data' })
    }
});

const fetchTodaysOpenEngineData = asyncHandler(async (req, res) =>
{
    if (!req.userId) return res.status(400).send("missing information");
    const foundUser = await User.findById(req.userId).populate({ path: 'planAndTrackedStocks', select: 'tickerSymbol -_id' }).select('planAndTrackedStocks -_id');
    if (!foundUser) res.status(404).json({ message: 'User not found.' })
    const tickersForHistoricalData = foundUser.planAndTrackedStocks.map(t => t.tickerSymbol)

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const startDate = subBusinessDays(todayStart, 1)

    try
    {
        await retryOperation(async () =>
        {
            const tickerData = await alpaca.getMultiBarsV2(tickersForHistoricalData, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.MIN), start: startDate });
            const candleData = {}
            for await (let singleStock of tickerData) { candleData[singleStock[0]] = singleStock[1] }
            res.json(candleData);
        })
    } catch (error)
    {
        console.error('Error fetching data today candles:', error);
        res.status(500).json({ message: 'error requesting stock data' })
    }

})

const fetchTodaysRegularEngineData = asyncHandler(async (req, res) =>
{
    if (!req.userId) return res.status(400).send("missing information");
    const foundUser = await User.findById(req.userId).populate({ path: 'planAndTrackedStocks', select: 'tickerSymbol maintainLiveCandles -_id' }).select('planAndTrackedStocks -_id');
    if (!foundUser) res.status(404).json({ message: 'User not found.' })
    const tickersForHistoricalData = []
    foundUser.planAndTrackedStocks.forEach(t => { if (!t.maintainLiveCandles) tickersForHistoricalData.push(t.tickerSymbol) })

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const startDate = subBusinessDays(todayStart, 1)

    try
    {
        await retryOperation(async () =>
        {
            const tickerData = await alpaca.getMultiBarsV2(tickersForHistoricalData, { timeframe: alpaca.newTimeframe(5, alpaca.timeframeUnit.MIN), start: startDate });
            const candleData = {}
            for await (let singleStock of tickerData) { candleData[singleStock[0]] = singleStock[1] }
            res.json(candleData);
        })
    } catch (error)
    {
        console.error('Error fetching data today candles:', error);
        res.status(500).json({ message: 'error requesting stock data' })
    }
})

const fetchTodaysRegularOneMinEngineData = asyncHandler(async (req, res) =>
{
    if (!req.userId) return res.status(400).send("missing information");
    const foundUser = await User.findById(req.userId).populate({ path: 'planAndTrackedStocks', select: 'tickerSymbol maintainLiveCandles -_id' }).select('planAndTrackedStocks -_id');
    if (!foundUser) res.status(404).json({ message: 'User not found.' })
    const oneMinTickers = []
    foundUser.planAndTrackedStocks.forEach((t) => { if (t?.maintainLiveCandles) oneMinTickers.push(t.tickerSymbol) })


    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const startDate = subBusinessDays(todayStart, 1)

    try
    {
        await retryOperation(async () =>
        {
            const tickerData = await alpaca.getMultiBarsV2(oneMinTickers, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.MIN), start: startDate });
            const candleData = {}
            for await (let singleStock of tickerData) { candleData[singleStock[0]] = singleStock[1] }
            res.json(candleData);
        })
    } catch (error)
    {
        console.error('Error fetching data today candles:', error);
        res.status(500).json({ message: 'error requesting stock data' })
    }
})



const fetchTradeEngineData = asyncHandler(async (req, res) =>
{
    if (!req.userId) return res.status(400).send("missing information");
    const foundUser = await User.findById(req.userId).populate({ path: 'planAndTrackedStocks', select: 'tickerSymbol maintainLiveCandles -_id' }).select('planAndTrackedStocks -_id');
    if (!foundUser) res.status(404).json({ message: 'User not found.' })
    const oneMinTickers = []
    foundUser.planAndTrackedStocks.forEach((t) => { if (t?.maintainLiveCandles) oneMinTickers.push(t.tickerSymbol) })

    const startMin = subMinutes(new Date(), 2)

    try
    {
        await retryOperation(async () =>
        {
            const tickerData = await alpaca.getMultiTradesV2(oneMinTickers, { start: startMin })
            const jsonCompatible = Object.fromEntries(tickerData)
            res.json(jsonCompatible)
        })
    } catch (error)
    {
        console.error('Error fetching data today candles:', error);
        res.status(500).json({ message: 'error requesting stock data' })
    }
})


module.exports = {
    fetchHistoricalEngineData,
    fetchTodaysOpenEngineData,
    fetchTodaysRegularEngineData,
    fetchTodaysRegularOneMinEngineData,
    fetchTradeEngineData
};
