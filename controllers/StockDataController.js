const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const Alpaca = require('@alpacahq/alpaca-trade-api')
const { ObjectId } = require("mongodb");
const { startOfWeek, subDays, subBusinessDays } = require('date-fns');
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
