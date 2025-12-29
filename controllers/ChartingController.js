const ChartableStock = require("../models/ChartableStock");
const asyncHandler = require("express-async-handler");

const fetchChartingData = asyncHandler(async (req, res) => {
  const { chartId } = req.params;
  const foundChartableStock = await ChartableStock.findById(chartId);
  res.json(foundChartableStock);
});

module.exports = {
  fetchChartingData,
};
