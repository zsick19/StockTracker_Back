const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const Alpaca = require('@alpacahq/alpaca-trade-api')
const { ObjectId } = require("mongodb");
const { startOfWeek, subDays } = require('date-fns');
const { retryOperation } = require("../Utility/sharedUtility");

const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });

const stockDataFetchWithLiveFeed = asyncHandler(async (req, res) =>
{
  const { ticker } = req.params;
  const { timeFrame } = req.body
  const liveFeed = req.query.liveFeed;

  if (!ticker || !timeFrame) return res.status(400).send('Missing Request Information')

  let start = new Date()
  let end = subDays(new Date(), 1)
  start = subDays(start, timeFrame.duration)
  let options = { timeframe: `${timeFrame.increment}${timeFrame.unitOfIncrement}`, start, end }

  try
  {
    await retryOperation(async () =>
    {
      const data = await alpaca.getBarsV2(ticker, options);
      const mostRecentPrice = await alpaca.getLatestTrade(ticker)
      const candleData = []
      for await (let singleStock of data) { candleData.push(singleStock) }
      res.json({ candleData, mostRecentPrice: mostRecentPrice })
    })
  } catch (error)
  {
    console.error('Error fetching data:', error);
    res.status(500).json({ message: 'error requesting stock data' })
  }

});

module.exports = {
  stockDataFetchWithLiveFeed,
};
