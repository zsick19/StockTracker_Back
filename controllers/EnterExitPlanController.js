const ChartableStock = require("../models/ChartableStock");
const StockHistory = require("../models/StockHistory");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const { ObjectId } = require("mongodb");

const initiateEnterExitPlan = asyncHandler(async (req, res) =>
{
  console.log(req.params.chartId)
  console.log(req.body)
  res.json({ m: 'connected' })
});

const updateEnterExitPlan = asyncHandler(async (req, res) =>
{
  console.log(req.params.enterExitId)
  console.log(req.body)
  res.json({ m: 'connected' })
})

const removeEnterExitPlan = asyncHandler(async (req, res) =>
{
  res.json({ m: 'connected' })
})


module.exports = {
  initiateEnterExitPlan,
  updateEnterExitPlan,
  removeEnterExitPlan
};
