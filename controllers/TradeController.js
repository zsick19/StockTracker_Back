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



const createTradeRecord = asyncHandler(async (req, res) =>
{
  const { tickerSymbol, positionSize, purchasePrice, tradingPlanPrices, enterExitPlanId } = req.body

  if (!tickerSymbol || !positionSize || !purchasePrice || !tradingPlanPrices || !enterExitPlanId) return res.status(400).json({ message: 'Missing Required Information' })

  const foundTradeRecord = await TradeRecord.findOne({ ticker: tickerSymbol, userId: req.userId })
  if (foundTradeRecord && !foundTradeRecord.tradeComplete) return res.status(400).json({ message: 'Can not initiate a still open trade record.' })

  const foundUser = await User.findById(req.userId)

  const createdTradeRecord = await TradeRecord.create({
    tickerSymbol,
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
    foundUser.previousTradeRecords.push(createdTradeRecord)
    await foundUser.save()

    let taskData = {
      action: 'enter',
      tickerSymbol,
      userId: foundUser._id.toString(),
      tradeEnterPrice: purchasePrice
    }

    sendRabbitMessage(req, res, rabbitQueueNames.enterExitTradeQueue, taskData)


    res.json(createdTradeRecord)
  } else
    res.status(500).json({ message: 'Error creating trade' })

})

const alterTradeRecord = asyncHandler(async (req, res) =>
{

})

const exitTradeRecord = asyncHandler(async (req, res) =>
{
  // const {tickerSymbol}=req.params
  // //if trade record is marked complete/no more shares

  // let taskData = {
  //   action: 'exit',
  //   tickerSymbol,
  //   userId: foundUser._id.toString(),
  // }

  // sendRabbitMessage(req, res, rabbitQueueNames.enterExitTradeQueue, taskData)


})


module.exports = {
  fetchUsersActiveTrades,
  createTradeRecord,
  alterTradeRecord,
  exitTradeRecord
};
