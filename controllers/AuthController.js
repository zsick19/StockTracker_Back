const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");

const sectorTickerSymbols = [
  "XLE",
  "XLB",
  "XLI",
  "XLY",
  "XLP",
  "XLV",
  "XLF",
  "XLK",
  "XTL",
  "XLU",
  "XLRE",
];

const registerNewTestUser = asyncHandler(async (req, res) => {
  const testUser = await User.create({ macroWatchLists: [] });

  const sectorChartableStocks = sectorTickerSymbols.map((ticker) => {
    return {
      tickerSymbol: ticker,
      chartedBy: new ObjectId(testUser._id),
    };
  });

  const sectorTickerResult = await ChartableStock.insertMany(
    sectorChartableStocks
  );

  const watchListTickers = sectorTickerResult.map((ticker) => {
    return { _id: ticker._id, ticker: ticker.tickerSymbol };
  });

  const macroSectorWatchlist = await WatchList.create({
    title: "Sector",
    tickersContained: watchListTickers,
    user: new ObjectId(testUser._id),
  });

  if (testUser.macroWatchLists) {
    testUser.macroWatchLists.push(macroSectorWatchlist);
  } else {
    testUser.macroWatchLists = [];
    testUser.macroWatchList.push(macroSectorWatchlist);
  }

  await testUser.save();

  if (testUser) res.json(testUser);
});

module.exports = {
  registerNewTestUser,
};
