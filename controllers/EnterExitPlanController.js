const ChartableStock = require("../models/ChartableStock");
const EnterExitPlannedStock = require('../models/EnterExitPlannedStock')
const StockHistory = require("../models/StockHistory");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const { ObjectId } = require("mongodb");
const Alpaca = require('@alpacahq/alpaca-trade-api')
const { sendRabbitMessage, rabbitQueueNames } = require('../config/rabbitMQService')

const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });



const initiateEnterExitPlan = asyncHandler(async (req, res) =>
{
  const { enterPrice, enterBufferPrice, stopLossPrice, exitBufferPrice, exitPrice, moonPrice, percents, dateCreated } = req.body
  if (!enterPrice || !enterBufferPrice || !stopLossPrice || !exitBufferPrice || !exitPrice || !moonPrice || !percents || !dateCreated) return res.status(400).json({ message: 'Missing required fields.' })

  const foundUser = await User.findById(req.userId)
  if (!foundUser) return res.status(404).json({ message: 'User not found' })
  const foundChartableStock = await ChartableStock.findById(req.params.chartId)
  if (!foundChartableStock) return res.status(404).json({ message: 'Chart Not Found' })


  const latestTradePrice = await alpaca.getLatestTrade(foundChartableStock.tickerSymbol)




  const createdEnterExitPlannedStock = await EnterExitPlannedStock.create({
    _id: foundChartableStock._id,
    tickerSymbol: foundChartableStock.tickerSymbol,
    sector: foundChartableStock.sector,
    plan: { enterPrice, enterBufferPrice, stopLossPrice, exitBufferPrice, exitPrice, moonPrice, percents, dateCreated },
    initialTrackingPrice: latestTradePrice?.Price || undefined,
    priceHitSinceTracked: 0,
    chartedBy: foundUser._id
  })

  if (createdEnterExitPlannedStock)
  {
    foundChartableStock.status = 3
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
    await EnterExitPlannedStock.findByIdAndUpdate(enterExitId, { highImportance: importantDate })
    res.json({ highImportance: importantDate })
  } else
  {
    await EnterExitPlannedStock.findByIdAndUpdate(enterExitId, { highImportance: null })
    res.json({ highImportance: undefined })
  }
})


const updateEnterExitPlan = asyncHandler(async (req, res) =>
{
  const { id, stopLossPrice, enterPrice, enterBufferPrice, exitBufferPrice, exitPrice, moonPrice, percents } = req.body
  if (!id || !enterPrice || !enterBufferPrice || !stopLossPrice || !exitBufferPrice || !exitPrice || !moonPrice || !percents) return res.status(400).json({ message: 'Missing required fields.' })

  const foundEnterExitPlan = await EnterExitPlannedStock.findById(id)
  foundEnterExitPlan.plan = { ...foundEnterExitPlan.plan, stopLossPrice, enterPrice, enterBufferPrice, exitBufferPrice, exitPrice, moonPrice, percents }
  await foundEnterExitPlan.save()

  let taskData = {
    remove: false,
    tickerSymbol: foundEnterExitPlan.tickerSymbol,
    pricePoints: [stopLossPrice, enterPrice, enterBufferPrice, exitBufferPrice, exitPrice, moonPrice]
  }

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
  let taskData = { remove: true, tickerSymbol: Array.from(setForRemoval), userId: req.userId }
  console.log(taskData)
  sendRabbitMessage(req, res, rabbitQueueNames.updateTrackingQueueName, taskData)



  await foundUser.save()
  res.json({ removeChartResult, removeEnterExitPlan, historyRemoved, removeTheseTickers })


})

module.exports = {
  initiateEnterExitPlan,
  togglePlanImportance,
  updateEnterExitPlan,
  removeEnterExitPlan,
  removeGroupEnterExitPlan
};
