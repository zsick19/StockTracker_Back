const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");

const userLoginDataFetch = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).send("missing information");

  const foundUser = await User.findById(userId).populate({
    path: "macroWatchLists",
  });

  res.json(foundUser);
});

module.exports = {
  userLoginDataFetch,
};
