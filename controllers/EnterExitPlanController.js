const ChartableStock = require("../models/ChartableStock");
const EnterExitPlannedStock = require('../models/EnterExitPlannedStock')
const StockHistory = require("../models/StockHistory");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const { ObjectId } = require("mongodb");

const initiateEnterExitPlan = asyncHandler(async (req, res) =>
{
  const { enterPrice, enterBufferPrice, stopLossPrice, exitBufferPrice, exitPrice, moonPrice, percents, dateCreated } = req.body
  if (!enterPrice || !enterBufferPrice || !stopLossPrice || !exitBufferPrice || !exitPrice || !moonPrice || !percents || !dateCreated) return res.status(400).json({ message: 'Missing required fields.' })

  const foundUser = await User.findById(req.userId)
  if (!foundUser) return res.status(404).json({ message: 'User not found' })
  const foundChartableStock = await ChartableStock.findById(req.params.chartId)
  if (!foundChartableStock) return res.status(404).json({ message: 'Chart Not Found' })

  const createdEnterExitPlannedStock = await EnterExitPlannedStock.create({
    _id: foundChartableStock._id,
    tickerSymbol: foundChartableStock.tickerSymbol,
    sector: foundChartableStock.sector,
    plan: { enterPrice, enterBufferPrice, stopLossPrice, exitBufferPrice, exitPrice, moonPrice, percents, dateCreated },
    chartedBy: foundUser._id
  })

  if (createdEnterExitPlannedStock)
  {
    foundChartableStock.plannedId = createdEnterExitPlannedStock._id
    await foundChartableStock.save()

    foundUser.planAndTrackedStocks.push(createdEnterExitPlannedStock)
    await foundUser.save()
  }

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
