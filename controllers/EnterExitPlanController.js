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
    foundChartableStock.status = 2
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
  res.json({ m: 'connected' })
})


module.exports = {
  initiateEnterExitPlan,
  updateEnterExitPlan,
  removeEnterExitPlan
};
