const ChartableStock = require("../models/ChartableStock");
const asyncHandler = require("express-async-handler");
const EnterExitPlannedStock = require("../models/EnterExitPlannedStock");
const { sendRabbitMessage, rabbitQueueNames } = require("../config/rabbitMQService");
const User = require("../models/User");
const StockHistory = require("../models/StockHistory");
const MacroChartedStock = require("../models/MacroChartedStock");

const fetchChartingAndKeyLevelData = asyncHandler(async (req, res) =>
{
  const { chartId } = req.params;
  if (!chartId) return res.status(400).json({ message: 'Missing Required Information' })
  const foundChartableStock = await ChartableStock.findById(chartId).populate('plannedId');
  if (!foundChartableStock) return res.status(404).json({ message: 'Chart does not exist.' })

  res.json(foundChartableStock)
});

const updateUserChartingPerChartId = asyncHandler(async (req, res) =>
{
  const { chartId } = req.params;
  const chartingUpdate = req.body
  const foundChartableStock = await ChartableStock.findById(chartId)
  foundChartableStock.charting = chartingUpdate
  if (foundChartableStock.status < 3) foundChartableStock.status = 2
  await foundChartableStock.save()
  res.json(chartingUpdate)
})

const removeChartableStock = asyncHandler(async (req, res) =>
{
  const { chartId } = req.params
  if (!chartId) return res.status(400).json({ message: 'Missing required information' })

  //remove the charting
  const removeChartResult = await ChartableStock.findByIdAndDelete(chartId)
  if (!removeChartResult) return res.status(500).json({ message: 'Error removing chart and/or plan.' })

  //find user and filter out the chartId
  const foundUser = await User.findById(removeChartResult.chartedBy)
  foundUser.confirmedStocks = foundUser.confirmedStocks.filter(t => t.toString() !== removeChartResult._id)
  foundUser.markModified('confirmedStocks')

  //remove the history from the user
  const foundUserHistory = await StockHistory.findOneAndDelete({ symbol: removeChartResult.tickerSymbol, userId: foundUser._id })
  if (foundUserHistory)
  {
    let stringIdForRemoval = foundUserHistory._id.toString()
    foundUser.userStockHistory = foundUser.userStockHistory.filter(t => t.toString() !== stringIdForRemoval)
    foundUser.markModified('userStockHistory')
  }

  //if there exists a plan, remove the plan and send message to stock tracker to remove tracking
  const removePossibleEnterExitPlan = await EnterExitPlannedStock.findByIdAndDelete(chartId)
  if (removePossibleEnterExitPlan)
  {
    let stringIdForRemoval = removePossibleEnterExitPlan._id.toString()
    foundUser.planAndTrackedStocks = foundUser.planAndTrackedStocks.filter(t => t.toString() !== stringIdForRemoval)
    foundUser.markModified('planAndTrackedStocks')
    let taskData = { remove: true, tickerSymbol: removePossibleEnterExitPlan.tickerSymbol, userId: req.userId }
    sendRabbitMessage(req, res, rabbitQueueNames.updateTrackingQueueName, taskData)
  }

  //save changes to any user and respond with deleted chart/plan
  await foundUser.save()
  res.send({ removedChart: removeChartResult, removedEnterExit: removePossibleEnterExitPlan, removedHistory: foundUserHistory })
})


const fetchKeyLevelsData = asyncHandler(async (req, res) =>
{
  const { chartId } = req.params;
  if (!chartId) return res.status(400)

  const foundMacroStock = await MacroChartedStock.findById(chartId).select({ gammaFlip: 1, callWall: 1, putWall: 1, dailyEM: 1, weeklyEM: 1, monthlyEM: 1, oneDayToExpire: 1, standardDeviation: 1, });
  if (!foundMacroStock) return res.status(404)

  res.json(foundMacroStock)
})

const updateKeyLevelData = asyncHandler(async (req, res) =>
{
  const { chartId } = req.params
  const { updatedKeyLevels } = req.body

  const foundMacroStock = await MacroChartedStock.findById(chartId);
  if (!foundMacroStock) return res.status(404)


  const updatedToday = new Date()
  foundMacroStock.dailyEM = { ...foundMacroStock.dailyEM, ...updatedKeyLevels.dailyEM, lastUpdated: updatedToday }
  foundMacroStock.weeklyEM = { ...foundMacroStock.weeklyEM, ...updatedKeyLevels.weeklyEM, lastUpdated: updatedToday }
  foundMacroStock.monthlyEM = { ...foundMacroStock.monthlyEM, ...updatedKeyLevels.monthlyEM, lastUpdated: updatedToday }

  foundMacroStock.gammaFlip = updatedKeyLevels.gammaFlip
  foundMacroStock.putWall = updatedKeyLevels.putWall
  foundMacroStock.callWall = updatedKeyLevels.callWall
  foundMacroStock.oneDayToExpire = updatedKeyLevels.oneDayToExpire
  foundMacroStock.standardDeviation = updatedKeyLevels.standardDeviation

  await foundMacroStock.save()

  res.json(foundMacroStock)
})




const fetchMacroChartingAndKeyLevelData = asyncHandler(async (req, res) =>
{
  const { macroChartId } = req.params;
  if (!macroChartId) return res.status(400).json({ message: 'Missing Required Information' })
  const foundMacroStock = await MacroChartedStock.findById(macroChartId);
  if (!foundMacroStock) return res.status(404).json({ message: 'Chart does not exist.' })
  res.json(foundMacroStock)
})



module.exports = {
  fetchChartingAndKeyLevelData,
  updateUserChartingPerChartId,
  fetchKeyLevelsData,
  updateKeyLevelData,
  removeChartableStock,
  fetchMacroChartingAndKeyLevelData
};
