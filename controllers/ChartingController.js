const ChartableStock = require("../models/ChartableStock");
const asyncHandler = require("express-async-handler");
const EnterExitPlannedStock = require("../models/EnterExitPlannedStock");
const { sendRabbitMessage, rabbitQueueNames } = require("../config/rabbitMQService");
const User = require("../models/User");
const StockHistory = require("../models/StockHistory");
const MacroChartedStock = require("../models/MacroChartedStock");
const Alpaca = require('@alpacahq/alpaca-trade-api');
// const { subDays } = require("date-fns/subDays");
const { nextMonday, isSameDay, subDays, isSameMonth, isMonday } = require('date-fns');
const MacroTickerWatch = require("../models/MacroTickerWatch");
const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });


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
  if (!foundChartableStock) return res.status(404)

  foundChartableStock.charting = chartingUpdate
  await foundChartableStock.save()
  if (foundChartableStock.status < 2) 
  {
    foundChartableStock.status = 1
    const foundHistory = await StockHistory.find({ userId: req.userId, symbol: foundChartableStock.tickerSymbol })
    if (foundHistory)
    {
      foundHistory.mostRecentHistory = { action: 'charted', date: new Date() }
      await foundHistory.save()
    }
  }


  res.json(chartingUpdate)
})

const updateMacroChartPerChartId = asyncHandler(async (req, res) =>
{
  const { macroChartId } = req.params;
  const chartingUpdate = req.body
  const foundMacroStock = await MacroChartedStock.findById(macroChartId)
  if (!foundMacroStock) return res.status(404)
  foundMacroStock.charting = chartingUpdate
  await foundMacroStock.save()
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
  foundUser.confirmedStocks.pull(removeChartResult._id)
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
  if (!macroChartId || macroChartId === 'undefined') return res.status(400).json({ message: 'Missing Required Information' })
  const foundMacroStock = await MacroChartedStock.findById(macroChartId);
  if (!foundMacroStock) return res.status(404).json({ message: 'Chart does not exist.' })
  res.json(foundMacroStock)
})

const updateDailyZones = asyncHandler(async (req, res) =>
{
  const { zones } = req.body
  if (!zones) return res.status(400).json({ message: 'Missing Zone Data' })


  await process(zones)
  async function process(zones)
  {

    for (const zone of zones)
    {

      const updateResult = await MacroChartedStock.findOne({ tickerSymbol: zone.ticker, chartedBy: req.userId })

      if (!updateResult) return
      updateResult.dailyZone = {
        low: zone.low,
        mid: zone.mid,
        high: zone.high,
        close: zone.close,
        range: zone.range,
        trend: zone.trend
      }
      await updateResult.save()
    }
  }



  res.json({ m: 'connected' })
})

const updateEMForSTDAlerts = asyncHandler(async (req, res) =>
{
  const { expectedMoves } = req.body

  if (!expectedMoves) return res.status(400).json({ message: 'Missing Expected Moves Data' })

  let nonBarTickers = ['DJX', 'NDX', 'SPX', 'XSP']

  for (const move of expectedMoves)
  {
    const foundEMTicker = await MacroTickerWatch.findOne({ _id: move.ticker })

    try
    {

      if (!foundEMTicker && !nonBarTickers.includes(move.ticker))
      {
        let today = new Date()
        const data = await alpaca.getBarsV2(move.ticker, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.DAY), start: subDays(today, 365), end: today });
        const candleData = []
        for await (let singleStock of data) { candleData.push(singleStock) }
        if (candleData.length !== 0)
        {
          await MacroTickerWatch.create({ _id: move.ticker, watchInfo: [{ userId: req.userId, dailyEM: move.dailyEM }] })
        }
      } else if (!nonBarTickers.includes(move.ticker))
      {
        foundEMTicker.watchInfo = [{ userId: req.userId, dailyEM: move.dailyEM }]
        await foundEMTicker.save()
      }
    } catch (error)
    {
      console.log(`Failed to Update ticker:${move.ticker}.`)
    }

  }

  let taskData = {
    update: 'daily'
  }

  sendRabbitMessage(req, res, rabbitQueueNames.updateEMAlertQueue, taskData)

  res.json({ message: 'connected' })
})

const updateDailyExpectedMoves = asyncHandler(async (req, res) =>
{
  const { expectedMoves } = req.body

  if (!expectedMoves) return res.status(400).json({ message: 'Missing Expected Moves Data' })

  let nonBarTickers = ['DJX', 'NDX', 'SPX', 'XSP']

  for (const move of expectedMoves)
  {

    const foundUpdateResult = await MacroChartedStock.findOne({ tickerSymbol: move.ticker, chartedBy: req.userId })
    try
    {
      if (!foundUpdateResult && !nonBarTickers.includes(move.ticker))
      {
        let today = new Date()
        const data = await alpaca.getBarsV2(move.ticker, { timeframe: alpaca.newTimeframe(1, alpaca.timeframeUnit.DAY), start: subDays(today, 365), end: today });
        const candleData = []
        for await (let singleStock of data) { candleData.push(singleStock) }
        if (candleData.length !== 0)
        {
          const createdMacro = await MacroChartedStock.create({
            tickerSymbol: move.ticker, chartedBy: req.userId,
            dailyEM: { iVolDailyEMLower: move.iVolLower, iVolDailyEMUpper: move.iVolUpper },
            standardDeviation: { sigma: move.sigma, close: move.priorClose }
          })
        }
      }
      else if (foundUpdateResult)
      {
        foundUpdateResult.dailyEM = { ...foundUpdateResult.dailyEM, iVolDailyEMLower: move.iVolLower, iVolDailyEMUpper: move.iVolUpper, lastUpdated: new Date() }
        foundUpdateResult.standardDeviation = { sigma: move.sigma, close: move.priorClose }
        await foundUpdateResult.save()
      }
    } catch (error)
    {
      console.log(`Error with daily expected moves for ${move.ticker}`)
    }
  }

  res.json({ message: 'updated' })
})


const updateWeeklyExpectedMoves = asyncHandler(async (req, res) =>
{
  const { expectedMoves } = req.body
  if (!expectedMoves) return res.status(400).json({ message: 'Missing Expected Moves Data' })
  let today = new Date()
  let monday = isMonday(today) ? today : nextMonday(today)

  for (const move of expectedMoves)
  {
    const foundUpdateResult = await MacroChartedStock.findOne({ tickerSymbol: move.ticker, chartedBy: req.userId })
    if (foundUpdateResult)
    {
      foundUpdateResult.weeklyEM = {
        ...foundUpdateResult.weeklyEM, iVolWeeklyEMLower: move.iVolLower,
        iVolWeeklyEMUpper: move.iVolUpper, lastUpdated: today,
        weeklyClose: move.priorClose, sigma: move.sigma
      }

      let dateOfLastPreviousWeek = foundUpdateResult.weeklyEM.previousWeeklyEM.at(-1)?.startDate

      if (!isSameDay(new Date(monday), new Date(dateOfLastPreviousWeek)) || !dateOfLastPreviousWeek)
      {
        foundUpdateResult.weeklyEM.previousWeeklyEM.push({ startDate: monday, upper: move.iVolUpper, lower: move.iVolLower })
      }
      await foundUpdateResult.save()
    }
  }

  res.json({ message: 'updated' })
})

const updateMonthlyExpectedMoves = asyncHandler(async (req, res) =>
{
  const { expectedMoves } = req.body
  if (!expectedMoves) return res.status(400).json({ message: 'Missing Expected Moves Data' })

  const today = new Date()
  for (const move of expectedMoves)
  {

    const foundUpdateResult = await MacroChartedStock.findOne({ tickerSymbol: move.ticker, chartedBy: req.userId })
    if (foundUpdateResult)
    {
      foundUpdateResult.monthlyEM = {
        ...foundUpdateResult.monthlyEM,
        monthLowerEM: move.iVolLower,
        monthUpperEM: move.iVolUpper,
        sigma: move.sigma,
        monthlyClose: move.priorClose,
        lastUpdated: today
      }

      let dateOfLastPreviousMonth = foundUpdateResult.previousMonthlyEM?.at(-1)?.startDate
      if (!dateOfLastPreviousMonth || !isSameMonth(today, new Date(dateOfLastPreviousMonth)))
      {
        foundUpdateResult.monthlyEM.previousMonthlyEM.push({ startDate: today, upper: move.iVolUpper, lower: move.iVolLower })
      }
      await foundUpdateResult.save()
    }
  }


  res.json({ message: 'updated' })

})

const updateQuarterlyExpectedMoves = asyncHandler(async (req, res) =>
{
  const { expectedMoves } = req.body
  if (!expectedMoves) return res.status(400).json({ message: 'Missing Expected Moves Data' })
  console.log(expectedMoves)
  res.json({ message: 'updated' })

})



module.exports = {
  fetchChartingAndKeyLevelData,
  updateUserChartingPerChartId,
  fetchKeyLevelsData,
  updateMacroChartPerChartId,
  updateKeyLevelData,
  removeChartableStock,
  fetchMacroChartingAndKeyLevelData,
  updateDailyZones,
  updateDailyExpectedMoves,
  updateWeeklyExpectedMoves,
  updateMonthlyExpectedMoves,
  updateQuarterlyExpectedMoves,
  updateEMForSTDAlerts
};
