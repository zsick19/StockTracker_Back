const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const StockHistory = require("../models/StockHistory");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");
const Alpaca = require('@alpacahq/alpaca-trade-api');
const TradeRecord = require("../models/TradeRecord");
const { sendRabbitMessage, rabbitQueueNames } = require("../config/rabbitMQService");
const EnterExitPlannedStock = require("../models/EnterExitPlannedStock");


const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });

const fetchUsersActiveTrades = asyncHandler(async (req, res) =>
{
  const foundUsersActiveTrades = await User.findById(req.userId).select('activeTradeRecords').populate("activeTradeRecords")
  let foundTrades = [...foundUsersActiveTrades.activeTradeRecords]

  if (foundTrades.length === 0) return res.json({ mostRecentPrices: [], activeTrades: [] })

  try
  {
    let mostRecentPrices = {}
    let previousClose = {}

    const tradesForMostRecentPrice = foundTrades.map((activeTrade) => activeTrade.tickerSymbol)
    const result = await alpaca.getSnapshots(tradesForMostRecentPrice)
    result.forEach((trade) =>
    {
      mostRecentPrices[trade.symbol] = trade.LatestTrade.Price
      previousClose[trade.symbol] = trade.PrevDailyBar.ClosePrice
    })


    res.json({ mostRecentPrices: mostRecentPrices, previousClose, activeTrades: foundTrades })
  } catch (error)
  {
    res.status(500).json({ message: 'Error Fetching Prices' })
  }

})

const fetchUsersTradeJournal = asyncHandler(async (req, res) =>
{
  const foundUsersPreviousTrades = await User.findById(req.userId).select('previousTradeRecords').populate('previousTradeRecords')
  if (!foundUsersPreviousTrades) return res.status(404).json({ message: 'User not found.' })
  res.json(foundUsersPreviousTrades.previousTradeRecords)
})


const createTradeRecord = asyncHandler(async (req, res) =>
{
  const { tickerSymbol, tickerSector, idealPercents, atrAtPurchase, daysToCover, idealGainPercent, positionSize, purchasePrice, tradingPlanPrices, enterExitPlanId } = req.body
  if (!tickerSymbol || !positionSize || !purchasePrice || !tradingPlanPrices || !enterExitPlanId || !idealPercents || !idealGainPercent) return res.status(400).json({ message: 'Missing Required Information' })


  if (!atrAtPurchase || !daysToCover)
  {
    //fetch and calculate atr and days to cover
  }

  const foundTradeRecord = await TradeRecord.findOne({ ticker: tickerSymbol, userId: req.userId })
  if (foundTradeRecord && !foundTradeRecord?.tradeComplete) return res.status(400).json({ message: 'Can not initiate a still open trade record.' })

  const foundUser = await User.findById(req.userId)
  const createdTradeRecord = await TradeRecord.create({
    tickerSymbol,
    sector: tickerSector,
    atrAtPurchase,
    daysToCover,
    tradingPlanPrices,
    enterExitPlanId,
    idealPercents,
    idealGainPercent,
    userId: foundUser._id,
    purchaseRecords: [{ purchasePrice, positionSize }],
    sellRecords: [],
    availableShares: positionSize,
    averagePurchasePrice: purchasePrice,
  })

  const updateChartableStockStatus = await ChartableStock.findByIdAndUpdate(enterExitPlanId, { status: 4 })

  const updateEnterExitPlan = await EnterExitPlannedStock.findById(enterExitPlanId)
  if (updateEnterExitPlan)
  {
    updateEnterExitPlan.plan.enterPrice = purchasePrice
    updateEnterExitPlan.tradeEnterDate = new Date()

    updateEnterExitPlan.plan.percents = [calcPercent(updateEnterExitPlan.plan.stopLossPrice),
    calcPercent(updateEnterExitPlan.plan.enterBufferPrice),
    calcPercent(updateEnterExitPlan.plan.exitBufferPrice),
    calcPercent(updateEnterExitPlan.plan.exitPrice),
    calcPercent(updateEnterExitPlan.plan.moonPrice)]
    function calcPercent(price) { return (Math.abs(parseFloat(((price - purchasePrice) / purchasePrice) * 100).toFixed(2))) }
    await updateEnterExitPlan.save()
  }








  if (createdTradeRecord)
  {
    foundUser.activeTradeRecords.push(createdTradeRecord)
    foundUser.planAndTrackedStocks.pull(enterExitPlanId)
    await foundUser.save()

    let taskData = { action: 'enter', tickerSymbol, userId: foundUser._id.toString(), tradeEnterPrice: purchasePrice }
    sendRabbitMessage(req, res, rabbitQueueNames.enterExitTradeQueue, taskData)

    res.json(createdTradeRecord)
  } else
    res.status(500).json({ message: 'Error creating trade' })
})

const alterTradeRecord = asyncHandler(async (req, res) =>
{
  const { action, tickerSymbol, tradeId, tradePrice, positionSizeOfAlter } = req.body

  if (!action || !tickerSymbol || !tradeId || !tradePrice || !positionSizeOfAlter) return res.status(400).json({ message: 'Missing required information.' })
  const foundTradeRecord = await TradeRecord.findById(tradeId)
  if (!foundTradeRecord) return res.status(404).json({ message: 'Trade Record not found.' })

  const today = new Date()
  switch (action)
  {
    case 'closeAll':
      const foundUser = await User.findById(req.userId)
      if (!foundUser) return res.status(404).json({ message: 'User Not Founds' })

      let positionSizeToClose = positionSizeOfAlter
      if (positionSizeOfAlter > foundTradeRecord.availableShares) positionSizeToClose = foundTradeRecord.availableShares
      foundTradeRecord.sellRecords.push({ sellPrice: tradePrice, positionSize: positionSizeToClose, sellDate: today })

      let averageSellPrice = 0
      let totalSellRecords = 0
      foundTradeRecord.sellRecords.forEach((record) =>
      {
        averageSellPrice = averageSellPrice + record.sellPrice;
        totalSellRecords = totalSellRecords + 1
      })

      foundTradeRecord.averageSellPrice = averageSellPrice / totalSellRecords
      foundTradeRecord.availableShares = foundTradeRecord.availableShares - positionSizeToClose

      if (foundTradeRecord.availableShares === 0)
      {
        foundTradeRecord.exitDate = today
        foundTradeRecord.tradeComplete = true

        foundTradeRecord.exitGain = parseFloat(((foundTradeRecord.averageSellPrice - foundTradeRecord.averagePurchasePrice) * positionSizeToClose).toFixed(2))
        foundTradeRecord.exitGainPercent = parseFloat((((foundTradeRecord.averageSellPrice - foundTradeRecord.averagePurchasePrice) / foundTradeRecord.averagePurchasePrice) * 100).toFixed(2))
        foundTradeRecord.exitMovePercent = parseFloat(((foundTradeRecord.averageSellPrice / foundTradeRecord.tradingPlanPrices[4]) * 100).toFixed(2))


        foundUser.confirmedStocks.pull(foundTradeRecord.enterExitPlanId)
        foundUser.planAndTrackedStocks.pull(foundTradeRecord.enterExitPlanId)

        foundUser.activeTradeRecords.pull(foundTradeRecord)
        foundUser.previousTradeRecords.push(foundTradeRecord)
        await foundUser.save()

        //send message to monitor to remove ticker
        let taskData = { remove: true, tickerSymbol: foundTradeRecord.tickerSymbol, userId: req.userId }
        sendRabbitMessage(req, res, rabbitQueueNames.updateTrackingQueueName, taskData)
      }
      break;

    case 'partialSell':

      break;
    case 'additionalBuy':

      break;
  }

  await foundTradeRecord.save()
  res.json(foundTradeRecord)
})



module.exports = {
  fetchUsersActiveTrades,
  createTradeRecord,
  alterTradeRecord,
  fetchUsersTradeJournal
};
