const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");
const MacroChartedStock = require("../models/MacroChartedStock");
const Alpaca = require('@alpacahq/alpaca-trade-api');

const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });
const fetchMajorMacroNews = asyncHandler(async (req, res) =>
{
  const tickerForSearch = req.query.tickerForSearch
  if (!tickerForSearch) return res.status(400).json({ message: 'Missing required information.' })
  const tickers = tickerForSearch.split(',')

  const news = await alpaca.getNews({ symbols: tickers })
  res.json(news)
})


module.exports = {
  fetchMajorMacroNews
};
