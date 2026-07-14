const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const Stock = require("../models/Stock");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");
const MacroChartedStock = require("../models/MacroChartedStock");
const Alpaca = require('@alpacahq/alpaca-trade-api');
const { rabbitQueueNames, sendRabbitMessage } = require("../config/rabbitMQService");
const { subBusinessDays } = require("date-fns/subBusinessDays");
const { v4 } = require("uuid");

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
  // let taskData = { trackedSymbols: tickerSymbols, alpacaNews: newsHeadlines }
  // if (newsHeadlines.length > 0) sendRabbitMessage(req, res, rabbitQueueNames.newsPassToAiAlert, taskData)


  res.json({ m: 'connected' })
})

const fetchTickerNews = asyncHandler(async (req, res) =>
{
  const tickerForSearch = req.query.tickerForSearch
  if (!tickerForSearch) return res.status(400).json({ message: 'Missing required information.' })

  const channel = req.app.locals.channel
  const replyQueue = await channel.assertQueue('', { exclusive: true });
  const correlationId = v4()

  
  const stockInfo = await Stock.findOne({ Symbol: tickerForSearch })

  const news = await alpaca.getNews({ symbols: [tickerForSearch] })
  if (news.length === 0) return res.json([])

  // Set up a structural timeout gate to prevent the client's browser from hanging if Python crashes
  const timeoutSentry = setTimeout(() => { res.status(504).json({ error: "Gateway Timeout: Python AI Service offline." }); }, 5000);


  channel.consume(replyQueue.queue, (msg) =>
  {
    if (msg.properties.correlationId === correlationId)
    {
      clearTimeout(timeoutSentry);
      const finalAiAnalysis = JSON.parse(msg.content.toString());
      res.status(200).json(finalAiAnalysis);
    }
  }, { noAck: true });


  let taskData = { data: { trackedSymbols: [tickerForSearch], alpacaNews: news, stockDetails: { sector: stockInfo.Sector, industry: stockInfo.Industry } } }
  channel.sendToQueue(rabbitQueueNames.newsPassToAiAlert, Buffer.from(JSON.stringify(taskData)), { correlationId: correlationId, replyTo: replyQueue.queue });
})


module.exports = {
  fetchMajorMacroNews,
  fetchUsersActiveTradeNews,
  fetchTickerNews
};
