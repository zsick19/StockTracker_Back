const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");

const createUserWatchList = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const macro = req.query.macro;
  const { title } = req.body;

  if (!userId || !title) return res.statusCode(404);

  const foundUser = await User.findById(userId);
  if (!foundUser) return res.status(401).json({ message: "Unauthorized" });

  const createdWatchList = await WatchList.create({
    title: title,
    tickersContained: [],
    user: foundUser._id,
  });

  if (macro) {
    foundUser.macroWatchLists.push(createdWatchList);
  }

  await foundUser.save();

  res.json(createdWatchList);
});

module.exports = {
  createUserWatchList,
};
