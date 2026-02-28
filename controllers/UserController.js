const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const StockHistory = require("../models/StockHistory");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");
const Alpaca = require('@alpacahq/alpaca-trade-api')
const { sendRabbitMessage, rabbitQueueNames } = require('../config/rabbitMQService')
const EnterExitPlannedStock = require('../models/EnterExitPlannedStock');
const TradeRecord = require("../models/TradeRecord");
const AccountPL = require('../models/AccountPL')
const MacroChartedStock = require('../models/MacroChartedStock')

const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });



const userLoginDataFetch = asyncHandler(async (req, res) =>
{
  if (!req.userId) return res.status(400).send("missing information");

  const foundUser = await User.findById(req.userId).populate('userStockHistory');

  if (!foundUser) res.status(404).json({ message: 'User not found.' })

  let taskData = { userId: foundUser._id }
  sendRabbitMessage(req, res, rabbitQueueNames.userLoggingInQueueName, taskData)

  res.json(foundUser);
});

const fetchAccountPL = asyncHandler(async (req, res) =>
{
  const foundAccount = await AccountPL.findById(req.userId)
  if (!foundAccount) res.status(404).json({ message: 'Account Not Found' })
  res.json(foundAccount)
})



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

const fetchUsersMacroSectorDailyZones = asyncHandler(async (req, res) =>
{
  const populatedDailyZones = await WatchList.find({ title: 'Sectors', user: req.userId }).select('tickersContained -_id')
  let macroIds = populatedDailyZones[0].tickersContained.map((macro) => new ObjectId(macro._id))

  const results = await MacroChartedStock.find({ _id: { $in: macroIds } }).select({ dailyZone: 1, tickerSymbol: 1, _id: 0 })
  if (results) { res.json(results) } else { res.status(404).json({ message: 'error fetching macro zones' }) }
})





//MARKET SEARCH PROGRESS AND FILTERS
const fetchUsersMarketSearchProgress = asyncHandler(async (req, res) =>
{
  const foundUserSearchProgress = await User.findById(req.userId).select('marketSearchProgress -_id')
  if (!foundUserSearchProgress) return res.status(404).json({ message: 'Progress Not Found' })
  res.json(foundUserSearchProgress)
})
const recordUsersMostRecentMarketPageSearch = asyncHandler(async (req, res) =>
{
  const { marketFilters, mostRecentPage, resultsPerPage } = req.body
  if (!marketFilters || !mostRecentPage) return res.status(400).json({ message: 'Missing required information.' })

  const foundUser = await User.findById(req.userId)
  if (!foundUser) return res.status(404).json({ message: 'User Not Found.' })

  foundUser.marketSearchProgress = { mostRecentPage, filterParams: { ...marketFilters }, resultsPerPage }
  await foundUser.save()

  res.json({ message: 'Connected' })
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
  const foundUser = await User.findById(req.userId).select('confirmedStocks').populate({
    path: 'confirmedStocks',
    select: 'tickerSymbol sector status dateAdded', options: { sort: { dateAdded: -1 } }
  }).lean().exec()
  if (!foundUser) return res.status(404).json({ message: 'User not found.' })

  res.json(foundUser.confirmedStocks)
})



const fetchUserEnterExitPlans = asyncHandler(async (req, res) =>
{
  const foundUser = await User.findById(req.userId).select('planAndTrackedStocks').populate({
    path: 'planAndTrackedStocks',
    select: 'tickerSymbol plan sector priceHitSinceTracked initialTrackingPrice dateAdded highImportance'
  }).lean().exec()

  let plansForSnapshots = foundUser.planAndTrackedStocks.map((plan) => plan.tickerSymbol)

  try
  {
    if (plansForSnapshots.length > 0)
    {
      const mostRecentPrice = await alpaca.getSnapshots(plansForSnapshots)
      res.json({ plans: foundUser.planAndTrackedStocks, mostRecentPrice })
    } else
    {
      res.json({ plans: [], mostRecentPrice: [] })
    }

  } catch (error)
  {
    res.status(500).json({ message: 'error fetching macro ticker data' })
    console.log(error)
  }

})




const resetUser = asyncHandler(async (req, res) =>
{
  const foundUser = await User.findById(req.userId)
  foundUser.userStockHistory = []
  foundUser.unConfirmedPatterns = []
  foundUser.confirmedStocks = []
  foundUser.planAndTrackedStocks = []
  foundUser.activeTradeRecords = []
  foundUser.previousTradeRecords = []
  await foundUser.save()

  await ChartableStock.deleteMany({})
  await EnterExitPlannedStock.deleteMany({})
  await StockHistory.deleteMany({})
  await TradeRecord.deleteMany({})
  res.json({ m: 'reset' })
})

module.exports = {
  userLoginDataFetch,
  fetchAccountPL,
  fetchUserMacroWatchListsWithTickerData,
  recordUsersMostRecentMarketPageSearch,
  fetchUsersMarketSearchProgress,
  createUserSavedMarketFilter,
  fetchUsersMacroSectorDailyZones,
  removeUserSavedMarketFilter,
  fetchUsersConfirmedPatterns,
  fetchUserEnterExitPlans,
  resetUser
};
