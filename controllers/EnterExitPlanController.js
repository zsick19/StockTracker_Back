const ChartableStock = require("../models/ChartableStock");
const EnterExitPlannedStock = require('../models/EnterExitPlannedStock')
const StockHistory = require("../models/StockHistory");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const { ObjectId } = require("mongodb");
const Alpaca = require('@alpacahq/alpaca-trade-api')
const { sendRabbitMessage, rabbitQueueNames } = require('../config/rabbitMQService');
const TradeRecord = require("../models/TradeRecord");
const { calculateEMADataPoints, calculateATR, calculateCurrentSingleRSI, calculateExtendedSessionProbabilities, calculateCompleteMorningMetrics } = require("../Utility/technicalIndicators");
const { isToday, subBusinessDays } = require('date-fns');
const Stock = require("../models/Stock");
const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });



const initiateEnterExitPlan = asyncHandler(async (req, res) =>
{
  const { enterPrice, enterBufferPrice, stopLossPrice, exitBufferPrice, exitPrice, moonPrice, percents, dateCreated } = req.body
  if (!enterPrice || !enterBufferPrice || !stopLossPrice || !exitBufferPrice || !exitPrice || !moonPrice || !percents || !dateCreated) return res.status(400).json({ message: 'Missing required fields.' })

  const foundUser = await User.findById(req.userId)
  if (!foundUser) return res.status(404).json({ message: 'User not found' })

  const foundChartableStock = await ChartableStock.findById(req.params.chartId)
  if (!foundChartableStock) return res.status(404).json({ message: 'Chart Not Found' })



  const startDate = subBusinessDays(new Date(), 180 + 10)
  const dailyCandles = await alpaca.getBarsV2(foundChartableStock.tickerSymbol, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.DAY), start: startDate })
  const candleData = [];
  for await (let b of dailyCandles) { candleData.push(b); }


  const snapShot = await alpaca.getSnapShot(foundChartableStock.tickerSymbol)

  const calculatedValues = {
    ema9: calculateEMADataPoints(candleData, 9),
    ema50: calculateEMADataPoints(candleData, 50),
    ema200: calculateEMADataPoints(candleData, 200),
    atr: calculateATR(candleData),
    rsi: calculateCurrentSingleRSI(candleData),
    PrevDailyBar: snapShot?.PrevDailyBar || undefined,
    DailyBar: snapShot?.DailyBar || undefined,
    dateCalculated: new Date()
  }


  const foundStock = await Stock.findOne({ Symbol: foundChartableStock.tickerSymbol })

  const createdEnterExitPlannedStock = await EnterExitPlannedStock.create({
    _id: foundChartableStock._id,
    tickerSymbol: foundChartableStock.tickerSymbol,
    sector: foundChartableStock.sector,
    hasOptions: foundStock.HasOptions || false,
    plan: { enterPrice, enterBufferPrice, stopLossPrice, exitBufferPrice, exitPrice, moonPrice, percents, dateCreated },
    initialTrackingPrice: snapShot?.LatestTrade?.Price || undefined,
    with1000DollarsIdealGain: parseFloat(((exitPrice - enterPrice) * Math.floor(1000 / enterPrice)).toFixed(2)),
    dailyTickerValues: { ...calculatedValues },
    chartedBy: foundUser._id,
    idealGPS: parseFloat((exitPrice - enterPrice).toFixed(2)),



    priceHitSinceTracked: 0,
  })

  if (createdEnterExitPlannedStock)
  {
    if (foundChartableStock.status < 3) { foundChartableStock.status = 2 }
    foundChartableStock.plannedId = createdEnterExitPlannedStock._id
    await foundChartableStock.save()

    foundUser.planAndTrackedStocks.push(createdEnterExitPlannedStock)
    await foundUser.save()


  }




  let pricePlan = [stopLossPrice, enterPrice, enterBufferPrice, exitBufferPrice, exitPrice, moonPrice]
  function getInsertionIndexLinear(arr, num)
  {
    for (let i = 0; i < 6; i++) { if (arr[i] >= num) { return i; } }
    return 6;
  }

  let taskData = {
    tickerSymbol: foundChartableStock.tickerSymbol,
    userId: foundUser._id.toString(),
    plannedTradeId: createdEnterExitPlannedStock._id.toString(),
    pricePoints: pricePlan,
    tradeStatus: getInsertionIndexLinear(pricePlan, latestTradePrice.Price),  //does this need to be updated/set right here
    purpose: 0 //watchlist vs tracking stock
  }

  sendRabbitMessage(req, res, rabbitQueueNames.initiateTrackingQueueName, taskData)
  res.json(createdEnterExitPlannedStock)
});


const togglePlanImportance = asyncHandler(async (req, res) =>
{
  const { enterExitId } = req.params
  const markImportant = req.query.markImportant === 'true'

  if (!enterExitId) return res.status(400).json({ message: 'Missing required information.' })
  const importantDate = new Date()
  if (markImportant)
  {
    const foundEnterExitPlan = await EnterExitPlannedStock.findById(enterExitId)
    foundEnterExitPlan.highImportance = importantDate

    if (!foundEnterExitPlan?.extentProb || !isToday(new Date(foundEnterExitPlan.extentProb?.dateCalculated)))
    {
      const startDate = foundEnterExitPlan?.relevantCandleDate.date ? new Date(foundEnterExitPlan.relevantCandleDate.date) : subBusinessDays(new Date(), 45)
      const fiveMinCandles = await alpaca.getBarsV2(foundEnterExitPlan.tickerSymbol, { timeframe: alpaca.newTimeframe(5, alpaca.timeframeUnit.MIN), start: startDate })
      const candleData = [];
      for await (let b of fiveMinCandles) { candleData.push(b); }

      const probability = calculateExtendedSessionProbabilities(candleData)
      foundEnterExitPlan.extentProb = {
        openH: probability.morningSession.highPrintedPercent,
        openL: probability.morningSession.lowPrintedPercent,
        midH: probability.middaySession.highPrintedPercent,
        midL: probability.middaySession.lowPrintedPercent,
        closeH: probability.closingSession.highPrintedPercent,
        closeL: probability.closingSession.lowPrintedPercent,
        dateCalculated: new Date()
      }

      const morningMetrics = calculateCompleteMorningMetrics(candleData)
      foundEnterExitPlan.morningMetrics = { upSide: { ...morningMetrics.upsideMetrics }, downSide: { ...morningMetrics.downsideMetrics }, dateCalculated: new Date() }
    }
    await foundEnterExitPlan.save()

    res.json({ highImportance: importantDate, extentProb: foundEnterExitPlan.extentProb, morningMetrics: foundEnterExitPlan.morningMetrics })
  } else
  {
    await EnterExitPlannedStock.findByIdAndUpdate(enterExitId, { highImportance: null })
    res.json({ highImportance: undefined })
  }
})
const togglePlanForTomorrow = asyncHandler(async (req, res) =>
{
  const { enterExitId } = req.params
  const markTomorrow = req.query.markTomorrow === 'true'

  if (!enterExitId) return res.status(400).json({ message: 'Missing required information.' })
  const markTomorrowDate = new Date()
  if (markTomorrow)
  {
    await EnterExitPlannedStock.findByIdAndUpdate(enterExitId, { watchForTomorrow: markTomorrowDate })
    res.json({ watchForTomorrow: markTomorrowDate })
  } else
  {
    await EnterExitPlannedStock.findByIdAndUpdate(enterExitId, { watchForTomorrow: null })
    res.json({ watchForTomorrow: undefined })
  }
})
const togglePlanNeedsUpdate = asyncHandler(async (req, res) =>
{
  const { enterExitId } = req.params
  const markUpdate = req.query.markUpdate === 'true'

  if (!enterExitId) return res.status(400).json({ message: 'Missing required information.' })
  const markUpdateDate = new Date()
  if (markUpdate)
  {
    await EnterExitPlannedStock.findByIdAndUpdate(enterExitId, { updateNeededDate: markUpdateDate })
    res.json({ updateNeededDate: markUpdateDate })
  } else
  {
    await EnterExitPlannedStock.findByIdAndUpdate(enterExitId, { updateNeededDate: null })
    res.json({ updateNeededDate: undefined })
  }
})



const updateEnterExitPlan = asyncHandler(async (req, res) =>
{
  const { id, stopLossPrice, enterPrice, enterBufferPrice, exitBufferPrice, exitPrice, moonPrice, percents, relevantHighs, relevantLows, institutionalPricePoints, } = req.body
  if (!id || !enterPrice || !enterBufferPrice || !stopLossPrice || !exitBufferPrice || !exitPrice || !moonPrice || !percents) return res.status(400).json({ message: 'Missing required fields.' })

  const foundEnterExitPlan = await EnterExitPlannedStock.findById(id)

  foundEnterExitPlan.plan = { ...foundEnterExitPlan.plan, stopLossPrice, enterPrice, enterBufferPrice, exitBufferPrice, exitPrice, moonPrice, percents }
  foundEnterExitPlan.idealGPS = parseFloat((exitPrice - enterPrice).toFixed(2))
  foundEnterExitPlan.with1000DollarsIdealGain = parseFloat(((exitPrice - enterPrice) * Math.floor(1000 / enterPrice)).toFixed(2))


  if (relevantHighs) foundEnterExitPlan.relevantHighs = relevantHighs
  if (relevantLows) foundEnterExitPlan.relevantLows = relevantLows
  if (institutionalPricePoints) foundEnterExitPlan.institutionalPricePoints = institutionalPricePoints

  await foundEnterExitPlan.save()

  let taskData = { remove: false, tickerSymbol: foundEnterExitPlan.tickerSymbol, pricePoints: [stopLossPrice, enterPrice, enterBufferPrice, exitBufferPrice, exitPrice, moonPrice] }
  sendRabbitMessage(req, res, rabbitQueueNames.updateTrackingQueueName, taskData)

  res.json(foundEnterExitPlan)
})

const removeEnterExitPlan = asyncHandler(async (req, res) =>
{
  const { enterExitId, historyId } = req.params
  if (!enterExitId || !historyId) return res.status(400).json({ message: 'Missing required information.' })

  const foundUser = await User.findById(req.userId)
  if (!foundUser) return res.status(404).json({ message: 'Data not found.' })

  //remove the charting
  const removeChartResult = await ChartableStock.findByIdAndDelete(enterExitId)
  foundUser.confirmedStocks.pull({ _id: enterExitId })

  const removeEnterExitPlan = await EnterExitPlannedStock.findByIdAndDelete(enterExitId)
  foundUser.planAndTrackedStocks.pull({ _id: enterExitId })

  try
  {
    const historyRemoved = await StockHistory.findByIdAndDelete(historyId)
    foundUser.userStockHistory.pull({ _id: historyId })
  } catch (error)
  {
    try
    {
      const searchAndFindHistory = await StockHistory.find({ symbol: removeChartResult.tickerSymbol, userId: req.userId })
      console.log(searchAndFindHistory)
      await StockHistory.findByIdAndDelete(searchAndFindHistory._id)
      foundUser.userStockHistory.pull({ _id: searchAndFindHistory._id })
    } catch (error)
    {
      console.log('Stock history can not be found.')
    }
  }

  await foundUser.save()

  let taskData = { remove: true, tickerSymbol: removeChartResult.tickerSymbol, userId: req.userId }
  sendRabbitMessage(req, res, rabbitQueueNames.updateTrackingQueueName, taskData)

  res.json({ m: 'Chart, Plan and History removed from user.' })
})

const removeGroupEnterExitPlan = asyncHandler(async (req, res) =>
{
  const { removeThesePlans, removeTheseTickers, removeHistory } = req.body

  if (!removeThesePlans || !removeTheseTickers || !removeHistory) return res.status(400).json({ message: 'Missing required information.' })

  const foundUser = await User.findById(req.userId)

  //remove the charting
  const removeChartResult = await ChartableStock.deleteMany({ _id: { $in: removeThesePlans } })
  const removeEnterExitPlan = await EnterExitPlannedStock.deleteMany({ _id: { $in: removeThesePlans } })
  const historyRemoved = await StockHistory.deleteMany({ _id: { $in: removeHistory } })

  //find user and filter out the chartId 
  const setForRemoval = new Set(removeThesePlans)
  let stringVersionOfConfirmed = foundUser.confirmedStocks.map((t) => t.toString())
  let stringVersionOfPlans = foundUser.planAndTrackedStocks.map((t) => t.toString())
  let stringVersionOfHistory = foundUser.userStockHistory.map((t) => t.toString())

  foundUser.confirmedStocks = Array.from(new Set(stringVersionOfConfirmed).symmetricDifference(setForRemoval))
  foundUser.planAndTrackedStocks = Array.from(new Set(stringVersionOfPlans).symmetricDifference(setForRemoval))
  foundUser.userStockHistory = Array.from(new Set(stringVersionOfHistory).symmetricDifference(new Set(removeHistory)))

  foundUser.markModified('planAndTrackedStocks')
  foundUser.markModified('confirmedStocks')
  foundUser.markModified('userStockHistory')




  // //if there exists a plan, remove the plan and send message to stock tracker to remove tracking
  let taskData = { remove: true, tickerSymbol: removeTheseTickers, userId: req.userId }
  console.log(taskData)
  sendRabbitMessage(req, res, rabbitQueueNames.updateTrackingQueueName, taskData)



  await foundUser.save()
  res.json({ removeChartResult, removeEnterExitPlan, historyRemoved, removeTheseTickers })


})

const updateEnterExitCriteriaCheckoff = asyncHandler(async (req, res) =>
{
  const { enterExitId } = req.params
  const criteria = req.query

  const foundEnterExit = await EnterExitPlannedStock.findById(enterExitId)
  foundEnterExit.checkOffCriteria = { ...foundEnterExit.checkOffCriteria, ...criteria }
  await foundEnterExit.save()

  res.json({ ticker: foundEnterExit.tickerSymbol, criteria })
})

module.exports = {
  initiateEnterExitPlan,
  togglePlanImportance,
  togglePlanForTomorrow,
  togglePlanNeedsUpdate,
  updateEnterExitPlan,
  removeEnterExitPlan,
  removeGroupEnterExitPlan,
  updateEnterExitCriteriaCheckoff
};
