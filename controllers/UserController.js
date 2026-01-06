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

const createUserSavedMarketFilter = asyncHandler(async (req, res) =>
{
  const filterToAdd = req.body
  if (!filterToAdd) return res.status(400).json({ message: 'Missing required information' })

  const foundUser = await User.findById(req.userId)
  if (!foundUser) return res.status(404).json({ message: 'User not found.' })

  let savedMarketSearchFilters = foundUser.marketSearchFilters

  let foundDuplicateTitle = false
  savedMarketSearchFilters.map((filter) =>
  {
    if (filter.title === filterToAdd.title)
    {
      foundDuplicateTitle = true
      return
    }
  })
  if (foundDuplicateTitle) return res.status(400).json({ message: 'Duplicate Title' })

  savedMarketSearchFilters.push(filterToAdd)
  foundUser.marketSearchFilters = savedMarketSearchFilters
  console.log(foundUser)

  await foundUser.save()
  res.json(foundUser.marketSearchFilters)
})

const removeUserSavedMarketFilter = asyncHandler(async (req, res) =>
{
  const { index, filterToRemove } = req.body
  if (!filterToRemove) return res.status(400).json({ message: 'Missing required information' })

  const foundUser = await User.findById(req.userId)
  if (!foundUser) return res.status(404).json({ message: 'User not found.' })

  let savedMarketSearchFilters = foundUser.marketSearchFilters

  if (savedMarketSearchFilters[index].title === filterToRemove.title)
  {
    console.log(index, filterToRemove.title)
    foundUser.marketSearchFilters = savedMarketSearchFilters.filter((filter, indexT) => indexT !== index)
  }
  else { foundUser.marketSearchFilters = savedMarketSearchFilters.filter((filter) => filter.title !== filterToRemove.title) }

  await foundUser.save()


  res.json(foundUser.marketSearchFilters)
})






module.exports = {
  userLoginDataFetch,
  fetchUserMacroWatchListsWithTickerData,
  createUserSavedMarketFilter,
  removeUserSavedMarketFilter
};
