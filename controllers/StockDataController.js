const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const Alpaca = require('@alpacahq/alpaca-trade-api')
const { ObjectId } = require("mongodb");
const { startOfWeek, subDays, subBusinessDays } = require('date-fns');
const { retryOperation } = require("../Utility/sharedUtility");
const Stock = require("../models/Stock");

const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });

const stockDataFetchWithLiveFeed = asyncHandler(async (req, res) =>
{
  const { ticker } = req.params;
  const { timeFrame } = req.body
  const liveFeed = req.query.liveFeed;
  const tickerInfoNeeded = req.query.info;

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
      const data = await alpaca.getBarsV2(ticker, { timeframe: timeframeForAlpaca, start, end });
      const mostRecentPrice = await alpaca.getLatestTrade(ticker)
      const candleData = []
      for await (let singleStock of data) { candleData.push(singleStock) }
      if (tickerInfoNeeded)
      {
        res.json({ candleData, mostRecentPrice: mostRecentPrice, tickerInfo })
      } else
      {
        res.json({ candleData, mostRecentPrice: mostRecentPrice })
      }
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

  let results = await Stock.aggregate([matchGenerator(body), { $project: { _id: 0 } }, { $skip: (pageSize * page) }, { $limit: parseInt(pageSize) }])

  function matchGenerator(body) { if (Object.keys(body).length === 0) { return { "$match": {} } } else { return { "$match": body } } }

  res.json({
    results,
    totalResults: 50
  })
})

module.exports = {
  stockDataFetchWithLiveFeed,
  fetchMarketSearchStockData
};
