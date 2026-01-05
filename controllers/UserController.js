const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");
const Alpaca = require('@alpacahq/alpaca-trade-api')


const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });


const userLoginDataFetch = asyncHandler(async (req, res) =>
{

  if (!req.userId) return res.status(400).send("missing information");

  const foundUser = await User.findById(req.userId);
  if (!foundUser) res.status(404).json({ message: 'User not found.' })

  res.json(foundUser);
});

const fetchUserMacroWatchListsWithTickerData = asyncHandler(async (req, res) =>
{
  const userId = req.userId
  const foundUser = await User.findById(userId).populate({ path: "macroWatchLists", });
  let usersMacroWatchList = foundUser.macroWatchLists

  const macroTickersForMostRecentPrices = []
  usersMacroWatchList.map((watchList) => { watchList.tickersContained.map(ticker => { macroTickersForMostRecentPrices.push(ticker.ticker) }) })

  try
  {
    const mostRecentPrice = await alpaca.getSnapshots(macroTickersForMostRecentPrices)
    res.json({ macroWatchList: usersMacroWatchList, tickerData: mostRecentPrice });

  } catch (error)
  {
    res.status(500).json({ message: 'error fetching macro ticker data' })
    console.log(error)
  }
})

module.exports = {
  userLoginDataFetch,
  fetchUserMacroWatchListsWithTickerData
};
