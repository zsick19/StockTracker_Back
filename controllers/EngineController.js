const User = require("../models/User");
const EnterExitPlannedStock = require('../models/EnterExitPlannedStock');
const MacroChartedStock = require('../models/MacroChartedStock')
const Alpaca = require('@alpacahq/alpaca-trade-api')
const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });
const asyncHandler = require("express-async-handler");
const { isWeekend, previousFriday, previousThursday, subBusinessDays, endOfYesterday, subMinutes, set } = require("date-fns");
const { retryOperation } = require("../Utility/sharedUtility");
const { Mongoose, default: mongoose } = require("mongoose");


const macroAndSectorTickers = ['SPY', 'RSP', 'QQQ', 'IWM', 'DIA', 'XLV', 'XLP', 'XLI', 'XLC', 'XLU', 'XLK', 'XLF', "XLB", 'XLE', 'XLY', 'XLRE']
const fetchHistoricalEngineData = asyncHandler(async (req, res) =>
{
    if (!req.userId) return res.status(400).send("missing information");
    const foundUser = await User.findById(req.userId)
        .populate({ path: 'planAndTrackedStocks', populate: { path: 'stockId' } })
        .select('planAndTrackedStocks -_id');

    if (!foundUser) res.status(404).json({ message: 'User not found.' })

    const foundMacroPlans = await MacroChartedStock.aggregate([
        {
            $match: {
                chartedBy: new mongoose.Types.ObjectId(req.userId),
                tickerSymbol: { $in: macroAndSectorTickers }
            }
        },
        {
            $project: {
                charting: 0,
                chartedBy: 0,
                "weeklyEM.previousWeeklyEM": 0,
                "monthlyEM.previousMonthlyEM": 0,
                "quarterlyEM.previousQuarterlyEM": 0
            },
        }
    ]
    )


    const fiveMinTickers = []
    const oneMinTickers = []
    const allPlans = []
    foundUser.planAndTrackedStocks.forEach((t) =>
    {
        allPlans.push(t.tickerSymbol)
        if (t?.maintainLiveCandles) oneMinTickers.push(t.tickerSymbol)
        else { fiveMinTickers.push(t.tickerSymbol) }
    })

    foundMacroPlans.forEach((t) => { allPlans.push(t.tickerSymbol) })


    let todayStart = set(new Date(), { hours: 0, minutes: 0, milliseconds: 0 })
    let startMin = subMinutes(new Date(), 2)
    if (isWeekend(todayStart)) { todayStart = previousFriday(new Date()) }

    const startDate = subBusinessDays(todayStart, 10)
    const threeDayStart = subBusinessDays(todayStart, 3)
    const yesterday = todayStart

    try
    {
        await retryOperation(async () =>
        {

            const snapShots = await alpaca.getSnapshots(allPlans)
            let oneMinData
            let oneMinTradesData
            let fiveMinData
            let jsonCompatible = {}
            const candleData = {}
            const macroCandleData = {}

            if (oneMinTickers.length > 0)
            {
                [oneMinTradesData, oneMinData] = await Promise.all([
                    alpaca.getMultiTradesV2(oneMinTickers, { start: startMin }),
                    alpaca.getMultiBarsV2(oneMinTickers, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.MIN), start: threeDayStart, end: yesterday }),
                ])
                for await (let singleStock of oneMinData) { candleData[singleStock[0]] = singleStock[1] }
                jsonCompatible = Object.fromEntries(oneMinTradesData)
            }

            if (fiveMinTickers.length > 0)
            {
                fiveMinData = await alpaca.getMultiBarsV2(fiveMinTickers, { timeframe: alpaca.newTimeframe(5, alpaca.timeframeUnit.MIN), start: startDate, end: yesterday })
                for await (let singleStock of fiveMinData)
                {
                    candleData[singleStock[0]] = singleStock[1]
                }
            }

            const macroData = await alpaca.getMultiBarsV2(macroAndSectorTickers, { timeframe: alpaca.newTimeframe(5, alpaca.timeframeUnit.MIN), start: startDate, end: yesterday })
            for await (let singleStock of macroData) { macroCandleData[singleStock[0]] = singleStock[1] }

            let plansResults = foundUser.planAndTrackedStocks.map((t) =>
            {
                let singleSnap = snapShots.find(ss => ss.symbol === t.tickerSymbol)
                return { plan: t, candleData: candleData[t.tickerSymbol], snapShot: singleSnap, tradeData: jsonCompatible[t.tickerSymbol] }
            })

            let macroResults = foundMacroPlans.map((t) =>
            {
                let singleSnap = snapShots.find(ss => ss.symbol === t.tickerSymbol)
                return { macroPlan: t, candleData: macroCandleData[t.tickerSymbol], snapShot: singleSnap }
            })

            res.json({ plans: plansResults, macros: macroResults });
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

    let startDate
    let todayStart = set(new Date(), { hours: 0, minutes: 0, milliseconds: 0 })
    if (isWeekend(todayStart)) { startDate = previousFriday(todayStart) }
    else { startDate = todayStart }
    const tickersForHistoricalData = foundUser.planAndTrackedStocks.map(t => t.tickerSymbol)


    tickersForHistoricalData.push(...macroAndSectorTickers)
    if (tickersForHistoricalData.length === 0) return res.status(200)
    try
    {
        await retryOperation(async () =>
        {
            const tickerData = await alpaca.getMultiBarsV2(tickersForHistoricalData, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.MIN), start: startDate });
            const candleData = {}
            const macroCandleData = {}
            for await (let singleStock of tickerData)
            {
                if (macroAndSectorTickers.includes(singleStock[0])) macroCandleData[singleStock[0]] = singleStock[1]
                else candleData[singleStock[0]] = singleStock[1]
            }
            res.json({ planData: candleData, macroData: macroCandleData });
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

    let todayStart = set(new Date(), { hours: 0, minutes: 0, milliseconds: 0 })
    let startDate = subBusinessDays(todayStart, 1)
    if (isWeekend(todayStart)) { startDate = previousFriday(todayStart) }
    else { startDate = set(new Date(), { hours: 0, minutes: 0, milliseconds: 0 }) }

    const tickersForHistoricalData = []


    foundUser.planAndTrackedStocks.forEach(t => { if (!t.maintainLiveCandles) tickersForHistoricalData.push(t.tickerSymbol) })

    if (tickersForHistoricalData.length === 0) return res.json([])
    try
    {
        await retryOperation(async () =>
        {
            const tickerData = await alpaca.getMultiBarsV2(tickersForHistoricalData, { timeframe: alpaca.newTimeframe(5, alpaca.timeframeUnit.MIN), start: startDate });
            const candleData = {}
            for await (let singleStock of tickerData) { candleData[singleStock[0]] = singleStock[1] }
            res.json({ planData: candleData });
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

    let startDate
    let todayStart = set(new Date(), { hours: 0, minutes: 0, milliseconds: 0 })
    if (isWeekend(todayStart)) { startDate = previousFriday(todayStart) }
    else { startDate = set(new Date(), { hours: 0, minutes: 0, milliseconds: 0 }) }

    const oneMinTickers = []
    foundUser.planAndTrackedStocks.forEach((t) => { if (t?.maintainLiveCandles) oneMinTickers.push(t.tickerSymbol) })
    oneMinTickers.push(...macroAndSectorTickers)

    try
    {
        await retryOperation(async () =>
        {
            const tickerData = await alpaca.getMultiBarsV2(oneMinTickers, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.MIN), start: startDate });
            const candleData = {}
            const macroCandleData = {}

            for await (let singleStock of tickerData)
            {
                if (macroAndSectorTickers.includes(singleStock[0])) macroCandleData[singleStock[0]] = singleStock[1]
                else candleData[singleStock[0]] = singleStock[1]
            }
            res.json({ planData: candleData, macroData: macroCandleData });
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
    const foundUser = await User.findById(req.userId)
        .populate({ path: 'planAndTrackedStocks', select: 'tickerSymbol maintainLiveCandles -_id' })
        .select('planAndTrackedStocks -_id');
    if (!foundUser) res.status(404).json({ message: 'User not found.' })

    const oneMinTickers = []
    const startMin = subMinutes(new Date(), 2)
    foundUser.planAndTrackedStocks.forEach((t) => { if (t?.maintainLiveCandles) oneMinTickers.push(t.tickerSymbol) })
    if (oneMinTickers.length === 0) return res.json({ tradeData: [] })

    try
    {
        await retryOperation(async () =>
        {
            const tickerData = await alpaca.getMultiTradesV2(oneMinTickers, { start: startMin })
            const jsonCompatible = Object.fromEntries(tickerData)
            res.json({ tradeData: jsonCompatible })
        })
    } catch (error)
    {
        console.error('Error fetching data today candles:', error);
        res.status(500).json({ message: 'error requesting stock data' })
    }
})

const fetchOpeningCrossData = asyncHandler(async (req, res) =>
{
    if (!req.userId) return res.status(400).send("missing information");
    const foundUser = await User.findById(req.userId)
        .populate('planAndTrackedStocks', 'tickerSymbol openCrossMetrics')
        .select('planAndTrackedStocks -_id');


    if (!foundUser) res.status(404).json({ message: 'User not found.' })

    res.json(foundUser)
})

const fetchMorningData = asyncHandler(async (req, res) =>
{
    if (!req.userId) return res.status(400).send("missing information");
    const foundUser = await User.findById(req.userId)
        .populate('planAndTrackedStocks', 'tickerSymbol optionsExpectedMoves dateOptionsEMLastCalculated dateMorningMetricsLastCalculated dateOptionsEMLastCalculated extentProb morningMetrics morningVolumeMetrics extremeProbByFiveMin volumeDistributionMetrics dateMorningMetricsLastCalculated')
        .select('planAndTrackedStocks -_id');

    if (!foundUser) res.status(404).json({ message: 'User not found.' })
    res.json(foundUser)
})
const fetchMiddayData = asyncHandler(async (req, res) =>
{
    if (!req.userId) return res.status(400).send("missing information");
    const foundUser = await User.findById(req.userId)
        .populate('planAndTrackedStocks', 'tickerSymbol optionsExpectedMoves dateOptionsEMLastCalculated')
        .select('planAndTrackedStocks -_id');

    if (!foundUser) res.status(404).json({ message: 'User not found.' })
    res.json(foundUser)
})
const fetchPostCloseData = asyncHandler(async (req, res) =>
{
    if (!req.userId) return res.status(400).send("missing information");
    const foundUser = await User.findById(req.userId)
        .populate('planAndTrackedStocks', 'tickerSymbol relevantDateBackTests relevantDateBackTestsUsingFloor volumeProfileMetrics dateVolumeProfileLastCalculated retailVsInstitutionMetrics dateRvILastCalculated absorptionWindowMetrics dateAbsorptionWindowLastCalculated dailyTickerValues correlationValues greatestCorrelation channelPattern continuationPattern cascadePattern datePatternLastCalculated')
        .select('planAndTrackedStocks -_id');

    if (!foundUser) res.status(404).json({ message: 'User not found.' })
    res.json(foundUser)
})


module.exports = {
    fetchHistoricalEngineData,
    fetchTodaysOpenEngineData,
    fetchTodaysRegularEngineData,
    fetchTodaysRegularOneMinEngineData,
    fetchTradeEngineData,
    fetchMorningData,
    fetchOpeningCrossData,
    fetchMiddayData,
    fetchPostCloseData
};
