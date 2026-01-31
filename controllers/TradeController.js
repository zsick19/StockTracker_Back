const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const StockHistory = require("../models/StockHistory");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");
const Alpaca = require('@alpacahq/alpaca-trade-api');
const TradeRecord = require("../models/TradeRecord");
const { sendRabbitMessage, rabbitQueueNames } = require("../config/rabbitMQService");


const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });

const fetchUsersActiveTrades = asyncHandler(async (req, res) =>
{
  const foundUsersActiveTrades = await User.findById(req.userId).select('activeTradeRecords').populate("activeTradeRecords")
  let foundTrades = [...foundUsersActiveTrades.activeTradeRecords]

  if (foundTrades.length === 0) return res.json({ mostRecentPrices: [], activeTrades: [] })

  try
  {
    let mostRecentPrices = {}
    const tradesForMostRecentPrice = foundTrades.map((activeTrade) => activeTrade.tickerSymbol)
    const result = await alpaca.getLatestTrades(tradesForMostRecentPrice)
    foundTrades.forEach((trade) => { mostRecentPrices[trade.tickerSymbol] = result.get(trade.tickerSymbol).Price })
    res.json({ mostRecentPrices: mostRecentPrices, activeTrades: foundTrades })
  } catch (error)
  {
    res.status(500).json({ message: 'Error Fetching Prices' })
  }

})

const fetchUsersTradeJournal = asyncHandler(async (req, res) =>
{
  const foundUsersPreviousTrades = await User.findById(req.userId).select('previousTradeRecords').populate('previousTradeRecords')
  console.log(foundUsersPreviousTrades)
  if (!foundUsersPreviousTrades) return res.status(404).json({ message: 'User not found.' })
  res.json(foundUsersPreviousTrades.previousTradeRecords)
})


const createTradeRecord = asyncHandler(async (req, res) =>
{
  const { tickerSymbol, tickerSector, positionSize, purchasePrice, tradingPlanPrices, enterExitPlanId } = req.body
  if (!tickerSymbol || !positionSize || !purchasePrice || !tradingPlanPrices || !enterExitPlanId) return res.status(400).json({ message: 'Missing Required Information' })

  const foundTradeRecord = await TradeRecord.findOne({ ticker: tickerSymbol, userId: req.userId })
  if (foundTradeRecord && !foundTradeRecord?.tradeComplete) return res.status(400).json({ message: 'Can not initiate a still open trade record.' })

  const foundUser = await User.findById(req.userId)
  const createdTradeRecord = await TradeRecord.create({
    tickerSymbol,
    sector: tickerSector,
    tradingPlanPrices,
    enterExitPlanId,
    userId: foundUser._id,
    purchaseRecords: [{ purchasePrice, positionSize }],
    sellRecords: [],
    availableShares: positionSize,
    averagePurchasePrice: purchasePrice,
  })


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
        averageSellPrice = averageSellPrice + record.sellPrice
        totalSellRecords = totalSellRecords + 1
      })
      foundTradeRecord.averageSellPrice = averageSellPrice / totalSellRecords
      foundTradeRecord.availableShares = foundTradeRecord.availableShares - positionSizeToClose

      if (foundTradeRecord.availableShares === 0)
      {
        foundTradeRecord.exitDate = today
        foundTradeRecord.tradeComplete = true

        foundUser.activeTradeRecords.pull(foundTradeRecord)
        foundUser.previousTradeRecords.push(foundTradeRecord)
        await foundUser.save()
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
