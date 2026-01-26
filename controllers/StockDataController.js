const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const Alpaca = require('@alpacahq/alpaca-trade-api')
const { ObjectId } = require("mongodb");
const { startOfWeek, subDays, subBusinessDays } = require('date-fns');
const { retryOperation } = require("../Utility/sharedUtility");
const Stock = require("../models/Stock");
const { sendRabbitMessage, rabbitQueueNames } = require('../config/rabbitMQService')


const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });

const stockDataFetchWithLiveFeed = asyncHandler(async (req, res) =>
{
  const { ticker } = req.params;
  const { timeFrame } = req.body
  const liveFeed = req.query.liveFeed;
  const tickerInfoNeeded = req.query.info;
  const provideNews = req.query.provideNews;

  if (!ticker || !timeFrame) return res.status(400).send('Missing Request Information')

  let tickerInfo
  if (tickerInfoNeeded) { tickerInfo = await Stock.findOne({ Symbol: ticker }) }

  let start = new Date()
  let end = subDays(new Date(), 1)
  let timeframeForAlpaca

  if (timeFrame.unitOfDuration === 'Y') { start = subDays(start, 365) }
  else if (timeFrame.unitOfDuration === 'D') { start = subBusinessDays(start, timeFrame.duration + 3) }

  switch (timeFrame.unitOfIncrement)
  {
    case "M": timeframeForAlpaca = alpaca.newTimeframe(timeFrame.increment, alpaca.timeframeUnit.MIN); break;
    case "D": timeframeForAlpaca = alpaca.newTimeframe(timeFrame.increment, alpaca.timeframeUnit.DAY); break;
    case "W": timeframeForAlpaca = alpaca.newTimeframe(timeFrame.increment, alpaca.timeframeUnit.WEEK); break;
    case "H": timeframeForAlpaca = alpaca.newTimeframe(timeFrame.increment, alpaca.timeframeUnit.HOUR); break;
  }


  try
  {
    await retryOperation(async () =>
    {
      let mostRecentPrice = undefined
      let newsPerTicker = undefined
      const data = await alpaca.getBarsV2(ticker, { timeframe: timeframeForAlpaca, start, end });
      mostRecentPrice = await alpaca.getLatestTrade(ticker)

      const candleData = []
      for await (let singleStock of data) { candleData.push(singleStock) }

      if (provideNews) { newsPerTicker = await alpaca.getNews({ symbols: [ticker] }) }
      if (liveFeed === 'true')
      {
        let taskData = { userId: req.userId, tickerSymbol: ticker }
        sendRabbitMessage(req, res, rabbitQueueNames.singleGraphTickerQueue, taskData)
      }

      res.json({ candleData, mostRecentPrice: mostRecentPrice, tickerInfo: tickerInfo, news: newsPerTicker })
      // if (tickerInfoNeeded) { res.json({ candleData, mostRecentPrice: mostRecentPrice, tickerInfo }) }
    })
  } catch (error)
  {
    console.error('Error fetching data:', error);
    res.status(500).json({ message: 'error requesting stock data' })
  }

});

const fetchMarketSearchStockData = asyncHandler(async (req, res) =>
{
  const page = req.query.page
  const pageSize = req.query.pageSize
  const body = req.body


  let filterResults = await Stock.aggregate([matchGenerator(body), { $project: { _id: 0 } },
  {
    $facet: {
      count: [{ $count: "total" }],
      data: [{ $skip: (pageSize * (page - 1)) }, { $limit: parseInt(pageSize) }]
    }
  }, { $unwind: "$count" }])


  let stocksThatMatchFilterResults = filterResults[0]?.data
  function matchGenerator(body) { if (Object.keys(body).length === 0) { return { "$match": {} } } else { return { "$match": body } } }


  let tickersForStockData = stocksThatMatchFilterResults.map((stock) => stock.Symbol)
  if (tickersForStockData.length === 0) return res.json({ stocksThatMatchFilterResults, totalResults: 0 })


  try
  {
    await retryOperation(async () =>
    {
      let options = { timeframe: '1D', start: subDays(new Date(), 180).toISOString().slice(0, 10) };

      const tickerData = await alpaca.getMultiBarsV2(tickersForStockData, options)
      const candleData = {}
      for await (let singleStock of tickerData) { candleData[singleStock[0]] = singleStock[1] }

      stocksThatMatchFilterResults.forEach((stock) => { stock.candleData = candleData[stock.Symbol] || undefined })

      res.json({ results: stocksThatMatchFilterResults, totalResults: filterResults[0]?.count.total })
    })
  } catch (error)
  {
    console.error("Error fetching candle data for market search", error)
    res.json({ message: 'Error fetching candle data' })
  }




})


const fetchGroupedStockData = asyncHandler(async (req, res) =>
{
  const { tickerGroup } = req.body
  if (!tickerGroup) return res.status(400).json({ message: 'Missing required information' })

  try
  {
    await retryOperation(async () =>
    {

      let options = { timeframe: alpaca.newTimeframe(5, alpaca.timeframeUnit.MIN), start: subDays(new Date(), 5).toISOString().slice(0, 10) };
      const tickerData = await alpaca.getMultiBarsV2(tickerGroup, options)

      let results = []
      for await (let singleStock of tickerData) { results.push({ ticker: singleStock[0], candleData: singleStock[1] }) }

      res.json(results)
    })
  } catch (error)
  {
    res.status(500).json({ message: 'Error Fetching Ticker Data' })

  }
})



module.exports = {
  stockDataFetchWithLiveFeed,
  fetchMarketSearchStockData,
  fetchGroupedStockData
};
