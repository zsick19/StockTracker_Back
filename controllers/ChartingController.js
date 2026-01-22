const ChartableStock = require("../models/ChartableStock");
const asyncHandler = require("express-async-handler");
const EnterExitPlannedStock = require("../models/EnterExitPlannedStock");
const { sendRabbitMessage, rabbitQueueNames } = require("../config/rabbitMQService");
const User = require("../models/User");
const StockHistory = require("../models/StockHistory");

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

  const foundChartableStock = await ChartableStock.findById(chartId);
  if (!foundChartableStock) return res.status(404)

  let keyLevelResponse = {
    gammaFlip: foundChartableStock?.gammaFlip,
    callWall: foundChartableStock?.callWall,
    putWall: foundChartableStock?.putWall
  }

  res.json(keyLevelResponse)
})

const updateKeyLevelData = asyncHandler(async (req, res) =>
{
  const { chartId } = req.params
  const { updatedKeyLevels } = req.body

  const foundChartableStock = await ChartableStock.findById(chartId);
  if (!foundChartableStock) return res.status(404)

  const updateDate = new Date()

  if (updatedKeyLevels.gammaFlip) foundChartableStock.gammaFlip = updatedKeyLevels.gammaFlip
  if (updatedKeyLevels.putWall) foundChartableStock.putWall = updatedKeyLevels.putWall
  if (updatedKeyLevels.callWall) foundChartableStock.callWall = updatedKeyLevels.callWall


  if (updatedKeyLevels.iVolEMDailyUpper)
  {
    if (!foundChartableStock.dailyEM) foundChartableStock.dailyEM = {}
    foundChartableStock.dailyEM.iVolDailyEMUpper = updatedKeyLevels.iVolEMDailyUpper
    updates.dailyEM = updateDate
  }
  if (updatedKeyLevels.iVolEMDailyLower)
  {
    if (!foundChartableStock.dailyEM) foundChartableStock.dailyEM = {}
    foundChartableStock.dailyEM.iVolDailyEMLower = updatedKeyLevels.iVolEMDailyLower
    updates.dailyEM = updateDate
  }
  if (updatedKeyLevels.dailyClose)
  {
    if (!foundChartableStock.dailyEM) foundChartableStock.dailyEM = {}
    foundChartableStock.dailyEM.dailyClose = updatedKeyLevels.dailyClose
    updates.dailyEM = updateDate
  }
  if (updatedKeyLevels.dailySigma)
  {
    if (!foundChartableStock.dailyEM) foundChartableStock.dailyEM = {}
    foundChartableStock.dailyEM.dailySigma = updatedKeyLevels.dailySigma
    updates.dailyEM = updateDate
  }

  if (updatedKeyLevels.iVolEMWeeklyUpper)
  {
    if (!foundChartableStock.weeklyEM) foundChartableStock.weeklyEM = {}
    foundChartableStock.weeklyEM.iVolWeeklyEMUpper = updatedKeyLevels.iVolEMWeeklyUpper
    updates.weeklyEM = updateDate
  }
  if (updatedKeyLevels.iVolEMWeeklyLower)
  {
    if (!foundChartableStock.weeklyEM) foundChartableStock.weeklyEM = {}
    foundChartableStock.weeklyEM.iVolWeeklyEMLower = updatedKeyLevels.iVolEMWeeklyLower
    updates.weeklyEM = updateDate
  }
  if (updatedKeyLevels.weeklyClose)
  {
    if (!foundChartableStock.weeklyEM) foundChartableStock.weeklyEM = {}
    foundChartableStock.weeklyEM.weeklyClose = updatedKeyLevels.weeklyClose
    updates.weeklyEM = updateDate
  }
  if (updatedKeyLevels.weeklySigma)
  {
    if (!foundChartableStock.weeklyEM) foundChartableStock.weeklyEM = {}
    foundChartableStock.weeklyEM.weeklySigma = updatedKeyLevels.weeklySigma
    updates.weeklyEM = updateDate
  }

  await foundChartableStock.save()

  res.json({ message: 'connected' })
})

const fetchUsersMacroKeyLevelsDate = asyncHandler(async (req, res) =>
{
  console.log(req.userId)




  res.json([{ _id: 'aa', ticker: 'SPY', dailyEM: { dailyClose: 123.33 } }, { _id: 'bb', ticker: 'DIA', dailyEM: { dailyClose: 25.47 } }])
})

const updateUsersMacroKeyLevelData = asyncHandler(async (req, res) =>
{

  res.json({ message: 'connected' })
})


module.exports = {
  fetchChartingAndKeyLevelData,
  updateUserChartingPerChartId,
  fetchKeyLevelsData,
  updateKeyLevelData,
  fetchUsersMacroKeyLevelsDate,
  updateUsersMacroKeyLevelData,
  removeChartableStock
};
