const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");
const MacroChartedStock = require("../models/MacroChartedStock");
const Alpaca = require('@alpacahq/alpaca-trade-api');
const { rabbitQueueNames, sendRabbitMessage } = require("../config/rabbitMQService");
const { subBusinessDays } = require("date-fns/subBusinessDays");

const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });
const fetchMajorMacroNews = asyncHandler(async (req, res) =>
{
  const tickerForSearch = req.query.tickerForSearch
  if (!tickerForSearch) return res.status(400).json({ message: 'Missing required information.' })
  const tickers = tickerForSearch.split(',')

  const news = await alpaca.getNews({ symbols: tickers })
  res.json(news)
})

const fetchUsersActiveTradeNews = asyncHandler(async (req, res) =>
{
  const foundUserActiveTrades = await User.findById(req.userId).populate({ path: 'activeTradeRecords', select: 'tickerSymbol -_id' }).select('activeTradeRecords -_id')
  let tickerSymbols = foundUserActiveTrades.activeTradeRecords.map(t => t.tickerSymbol)

  let start = subBusinessDays(new Date(), 10)
  start.setHours(0, 0, 0, 0)
  console.log(tickerSymbols)
  const newsHeadlines = await alpaca.getNews({ symbols: tickerSymbols, totalLimit: 50 })
  let taskData = { trackedSymbols: tickerSymbols, alpacaNews: newsHeadlines }
  if (newsHeadlines.length > 0) sendRabbitMessage(req, res, rabbitQueueNames.newsPassToAiAlert, taskData)


  res.json({ m: 'connected' })
})



module.exports = {
  fetchMajorMacroNews,
  fetchUsersActiveTradeNews
};
