const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");
const MacroChartedStock = require("../models/MacroChartedStock");

const sectorTickerSymbols = [

  "XLB",



];

const registerNewTestUser = asyncHandler(async (req, res) =>
{
  const testUser = await User.create({ macroWatchLists: [] });

  const sectorChartableStocks = sectorTickerSymbols.map((ticker) =>
  {
    return {
      tickerSymbol: ticker,
      chartedBy: new ObjectId(testUser._id),
    };
  });

  const sectorTickerResult = await ChartableStock.insertMany(
    sectorChartableStocks
  );

  const watchListTickers = sectorTickerResult.map((ticker) =>
  {
    return { _id: ticker._id, ticker: ticker.tickerSymbol };
  });

  const macroSectorWatchlist = await WatchList.create({
    title: "Sector",
    tickersContained: watchListTickers,
    user: new ObjectId(testUser._id),
  });

  if (testUser.macroWatchLists)
  {
    testUser.macroWatchLists.push(macroSectorWatchlist);
  } else
  {
    testUser.macroWatchLists = [];
    testUser.macroWatchList.push(macroSectorWatchlist);
  }

  await testUser.save();

  if (testUser) res.json(testUser);
});

const registerMacroStocksToUser = asyncHandler(async (req, res) =>
{
  console.log(req.userId)
  let groupToAddToMacroStocks = sectorTickerSymbols.map((sector) =>
  {
    return {
      tickerSymbol: sector,
      dailyEM: {
        iVolDailyEMUpper: null,
        iVolDailyEMLower: null,
        dailyEMLower: null,
        dailyEMUpper: null,
      },
      weeklyEM: {
        weeklyClose: null,
        sigma: null,
        previousWeeklyEM: []
      },
      monthlyEM: {
        monthlyClose: null,
        sigma: null,
        previousMonthlyEM: []
      }, charting: {
        freeLines: [],
        trendLines: [],
        linesH: []
      }, chartedBy: req.userId
    }
  })

  const results = await MacroChartedStock.insertMany(groupToAddToMacroStocks)

  console.log(results)
  res.json({ m: 'connected' })
})


module.exports = {
  registerNewTestUser,
  registerMacroStocksToUser
};
