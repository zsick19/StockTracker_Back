const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const StockHistory = require("../models/StockHistory");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");
const Alpaca = require('@alpacahq/alpaca-trade-api')


const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });


const userLoginDataFetch = asyncHandler(async (req, res) =>
{
  if (!req.userId) return res.status(400).send("missing information");

  const foundUser = await User.findById(req.userId).populate('userStockHistory');
  if (!foundUser) res.status(404).json({ message: 'User not found.' })

  res.json(foundUser);
});

const fetchUserMacroWatchListsWithTickerData = asyncHandler(async (req, res) =>
{
  const userId = req.userId
  const foundUser = await User.findById(userId).populate({ path: "macroWatchLists", });

  const macroTickersForMostRecentPrices = []
  foundUser.macroWatchLists.map((watchList) => { watchList.tickersContained.map(ticker => { macroTickersForMostRecentPrices.push(ticker.ticker) }) })

  try
  {
    const mostRecentPrice = await alpaca.getSnapshots(macroTickersForMostRecentPrices)
    res.json({ macroWatchList: foundUser.macroWatchLists, tickerData: mostRecentPrice });

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


const fetchUsersConfirmedPatterns = asyncHandler(async (req, res) =>
{
  const foundUser = await User.findById(req.userId).select('confirmedStocks').populate({ path: 'confirmedStocks', select: 'tickerSymbol sector status dateAdded', options: { sort: { dateAdded: -1 } } }).lean().exec()
  if (!foundUser) return res.status(404).json({ message: 'User not found.' })

  res.json(foundUser.confirmedStocks)
})


const fetchUserEnterExitPlans = asyncHandler(async (req, res) =>
{
  const foundUser = await User.findById(req.userId).select('planAndTrackedStocks').populate({
    path: 'planAndTrackedStocks',
    select: 'tickerSymbol plan priceHitSinceTracked'
  }).lean().exec()
  let plansForSnapshots = []
  foundUser.planAndTrackedStocks.map((plan) => { plansForSnapshots.push(plan.tickerSymbol) })

  try
  {
    const mostRecentPrice = await alpaca.getSnapshots(plansForSnapshots)
    res.json({ plans: foundUser.planAndTrackedStocks, mostRecentPrice })

  } catch (error)
  {
    res.status(500).json({ message: 'error fetching macro ticker data' })
    console.log(error)
  }

})




module.exports = {
  userLoginDataFetch,
  fetchUserMacroWatchListsWithTickerData,
  createUserSavedMarketFilter,
  removeUserSavedMarketFilter,
  fetchUsersConfirmedPatterns,
  fetchUserEnterExitPlans,
};
