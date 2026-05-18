const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");
const MacroChartedStock = require("../models/MacroChartedStock");




const createAlertForTicker = asyncHandler(async (req, res) =>
{
  console.log(req.body)
  res.json({ m: 'connected' })
})
const updateAlertForTickerWatch = asyncHandler(async (req, res) =>
{
  console.log(req.body)
  res.json({ m: 'connected' })
})
const markAlertSeenForTickerWatch = asyncHandler(async (req, res) =>
{
  console.log(req.body)
  res.json({ m: 'connected' })
})

const removeAlertForTickerWatch = asyncHandler(async (req, res) =>
{
  console.log(req.body)
  res.json({ m: 'connected' })
})


module.exports = {
  createAlertForTicker,
  updateAlertForTickerWatch,
  markAlertSeenForTickerWatch,
  removeAlertForTickerWatch
};
