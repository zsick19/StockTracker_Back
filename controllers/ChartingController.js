const ChartableStock = require("../models/ChartableStock");
const asyncHandler = require("express-async-handler");

const fetchChartingData = asyncHandler(async (req, res) =>
{
  const { chartId } = req.params;
  const foundChartableStock = await ChartableStock.findById(chartId);
  res.json(foundChartableStock);
});

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

const fetchUsersMacroKeyLevelsDate = asyncHandler(async (req, res) =>
{




  
  res.json([{ m: 'ww' }, { m: 'dd' }])
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

module.exports = {
  fetchChartingData,
  fetchKeyLevelsData,
  fetchUsersMacroKeyLevelsDate,
  updateKeyLevelData
};
