const ChartableStock = require("../models/ChartableStock");
const EnterExitPlannedStock = require('../models/EnterExitPlannedStock')
const StockHistory = require("../models/StockHistory");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const { ObjectId } = require("mongodb");
const Alpaca = require('@alpacahq/alpaca-trade-api')
const { sendRabbitMessage } = require('../config/rabbitMQService')

const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });


const initiateTrackingQueueName = 'TickerUserTracking_initiateQueue'
const updateTrackingQueueName = 'TickerUserTracking_updateQueue'

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
    chartedBy: foundUser._id
  })

  if (createdEnterExitPlannedStock)
  {
    foundChartableStock.plannedId = createdEnterExitPlannedStock._id
    await foundChartableStock.save()

    foundUser.planAndTrackedStocks.push(createdEnterExitPlannedStock)
    await foundUser.save()
  }



  let taskData = {
    Symbol: foundChartableStock.tickerSymbol,
    userId: foundUser._id,
    trackToTradeId: createdEnterExitPlannedStock._id,
    pricePoints: [stopLossPrice, enterPrice, enterBufferPrice, exitBufferPrice, exitPrice, moonPrice],
    tradeStatus: 0
  }

  sendRabbitMessage(req, res, initiateTrackingQueueName, taskData)







  res.json(createdEnterExitPlannedStock)
});





const updateEnterExitPlan = asyncHandler(async (req, res) =>
{
  const { id, stopLossPrice, enterPrice, enterBufferPrice, exitBufferPrice, exitPrice, moonPrice, percents } = req.body
  if (!id || !enterPrice || !enterBufferPrice || !stopLossPrice || !exitBufferPrice || !exitPrice || !moonPrice || !percents) return res.status(400).json({ message: 'Missing required fields.' })

  const foundEnterExitPlan = await EnterExitPlannedStock.findById(id)
  foundEnterExitPlan.plan = { ...foundEnterExitPlan.plan, stopLossPrice, enterPrice, enterBufferPrice, exitBufferPrice, exitPrice, moonPrice, percents }
  await foundEnterExitPlan.save()

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
