const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");
const MacroChartedStock = require("../models/MacroChartedStock");
const EnterExitPlannedStock = require("../models/EnterExitPlannedStock");
const TickerWatch = require("../models/TickerWatch");
const PriceAlert = require('../models/PriceAlert')



const createAlertForTicker = asyncHandler(async (req, res) =>
{
  const { chartId, ticker } = req.params
  const { aboveOrBelow, price } = req.body

  //update found plan
  const foundPlan = await EnterExitPlannedStock.findById(chartId)
  if (!foundPlan) return res.status(404)
  const foundTickerWatch = await TickerWatch.findById(ticker)
  if (!foundTickerWatch) return res.status()

  const foundAlert = await PriceAlert.find({ ticker: ticker, userId: req.userId })

  if (foundAlert.length > 0)
  {
    let alertAlreadyExists = false
    foundAlert.forEach(alert => { if (alert.priceBelow == aboveOrBelow && alert.price.toString() == price) alertAlreadyExists = true })
    if (alertAlreadyExists) return res.status(405).json({ m: 'Alert for ticker and price already exists' })
  }

  const createdAlert = await PriceAlert.create({ ticker, price, priceBelow: aboveOrBelow, triggered: false, seen: false, userId: req.userId })

  const updatedParent = await User.findByIdAndUpdate(req.userId, { $push: { priceAlerts: createdAlert._id } });

  foundPlan.priceAlerts.push(createdAlert._id)
  await foundPlan.save()

  //update ticker watch
  foundTickerWatch.watchInfo.map((t) =>
  {
    if (t.userId === req.userId)
    {
      if (aboveOrBelow)
      {
        t.belowThisPriceAlert.push({ price: price, seen: false, triggered: false, alertId: createdAlert._id })
      } else
      {
        t.aboveThisPriceAlert.push({ price: price, seen: false, triggered: false, alertId: createdAlert._id })
      }
    }
  })
  await foundTickerWatch.save()
  res.json(createdAlert)
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
