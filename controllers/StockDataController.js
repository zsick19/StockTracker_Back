const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const Alpaca = require('@alpacahq/alpaca-trade-api')
const { ObjectId } = require("mongodb");
const { subDays, subBusinessDays, sub } = require('date-fns');
const { retryOperation } = require("../Utility/sharedUtility");
const Stock = require("../models/Stock");
const { sendRabbitMessage, rabbitQueueNames } = require('../config/rabbitMQService')


const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });

const stockDataFetchWithLiveFeed = asyncHandler(async (req, res) =>
{
  const { ticker } = req.params;
  const { timeFrame } = req.body
  const liveFeed = req.query.liveFeed === 'true';
  const tickerInfoNeeded = req.query.info;
  const provideNews = req.query.provideNews;

  if (!ticker || !timeFrame || ticker === 'undefined' || ticker === 'UNDEFINED') return res.status(400).send('Missing Request Information')

  let tickerInfo
  if (tickerInfoNeeded) { tickerInfo = await Stock.findOne({ Symbol: ticker }) }

  let start = new Date().setHours(4, 0, 0, 0)
  let end = new Date()
  let timeframeForAlpaca

  if (timeFrame.unitOfDuration === 'Y') { start = subDays(start, 365) }
  else if (timeFrame.unitOfDuration === 'D') { start = subBusinessDays(start, timeFrame.duration + 2) }

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

      if (liveFeed)
      {
        let taskData = { userId: req.userId, tickerSymbol: ticker }
        sendRabbitMessage(req, res, rabbitQueueNames.singleGraphTickerQueue, taskData)
      }

      res.json({ candleData, mostRecentPrice: mostRecentPrice, tickerInfo: tickerInfo, news: newsPerTicker })
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


  let bodyMatch = matchGenerator(body)
  let filterResults = await Stock.aggregate([bodyMatch, { $sort: { Symbol: 1 } }, { $project: { _id: 0 } },
    {
      $facet: {
        count: [{ $count: "total" }],
        data: [{ $skip: (pageSize * (page - 1)) }, { $limit: parseInt(pageSize) }]
      }
    }, { $unwind: "$count" }])

  let stocksThatMatchFilterResults = filterResults[0]?.data
  function matchGenerator(body)
  {
    if (body.AvgVolume)
    {
      let avgV = parseInt(body.AvgVolume)
      if (avgV > 0) body.AvgVolume = { "$gt": avgV }
    }

    if (Object.keys(body).length === 0) { return { "$match": {} } }
    else { return { "$match": body } }
  }


  let tickersForStockData = stocksThatMatchFilterResults.map((stock) => stock.Symbol)
  if (tickersForStockData.length === 0) return res.json({ stocksThatMatchFilterResults, totalResults: 0 })


  try
  {
    await retryOperation(async () =>
    {
      let options = { timeframe: '1D', start: subDays(new Date(), 90).toISOString().slice(0, 10) };

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

const calculate14DayATR = asyncHandler(async (req, res) =>
{
  const { ticker } = req.params;
  if (!ticker) return res.status(400).send('Missing Request Information')

  let start = subBusinessDays(new Date(), 50)
  let end = new Date()
  let timeframeForAlpaca = alpaca.newTimeframe(1, alpaca.timeframeUnit.DAY);

  try
  {
    await retryOperation(async () =>
    {
      const data = await alpaca.getBarsV2(ticker, { timeframe: timeframeForAlpaca, start, end });

      const candleData = []
      for await (let singleStock of data) { candleData.push(singleStock) }
      let atrResult = calculateATR(candleData)
      res.json(atrResult)
    })
  } catch (error)
  {
    console.error('Error fetching data:', error);
    res.status(500).json({ message: 'error requesting stock data' })
  }


  function calculateATR(candles, period = 14)
  {
    if (candles.length < period) return [];

    let atr = new Array(candles.length).fill(null);
    let tr = new Array(candles.length);

    for (let i = 0; i < candles.length; i++)
    {
      const current = candles[i];
      if (i === 0) { tr[i] = current.high - current.low; } else
      {
        const prevClose = candles[i - 1].ClosePrice;
        tr[i] = Math.max(current.HighPrice - current.LowPrice, Math.abs(current.HighPrice - prevClose), Math.abs(current.LowPrice - prevClose));
      }
    }

    let sumTR = 0;
    for (let i = 1; i < period; i++) { sumTR += tr[i]; }
    atr[period - 1] = sumTR / period;
    for (let i = period; i < candles.length; i++) { atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period; }

    let firstATR = atr[13]
    let currentATR = atr.at(-1)
    let changeOverCandlePeriod = (currentATR - firstATR) / 50
    return { firstATR, currentATR, changeOverCandlePeriod };
  }
})






module.exports = {
  stockDataFetchWithLiveFeed,
  fetchMarketSearchStockData,
  fetchGroupedStockData,
  calculate14DayATR
};
