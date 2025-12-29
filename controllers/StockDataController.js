const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");

const stockDataFetchWithLiveFeed = asyncHandler(async (req, res) => {
  const { ticker } = req.params;
  const liveFeed = req.query.liveFeed;

  res.json([
    { h: 22, l: 45, o: 23, c: 55, vol: 232342 },
    { h: 22, l: 45, o: 23, c: 55, vol: 232342 },
    { h: 22, l: 45, o: 23, c: 55, vol: 232342 },
    { h: 22, l: 45, o: 23, c: 55, vol: 232342 },
    { h: 22, l: 45, o: 23, c: 55, vol: 232342 },
    { h: 22, l: 45, o: 23, c: 55, vol: 232342 },
  ]);
});

module.exports = {
  stockDataFetchWithLiveFeed,
};
