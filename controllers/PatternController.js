const ChartableStock = require("../models/ChartableStock");
const StockHistory = require("../models/StockHistory");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const { ObjectId } = require("mongodb");

const addPatternedStockToUser = asyncHandler(async (req, res) =>
{
  const ticker = req.query.patternToAdd
  if (!ticker) return res.status(400).json({ message: 'Missing Information' })

  const checkForDuplicate = await StockHistory.findOne({ symbol: ticker, userId: req.userId })
  if (checkForDuplicate) return res.status(400).json({ message: 'Pattern already exists.' })

  const createdHistory = await StockHistory.create({ symbol: ticker, userId: req.userId, history: [{ action: 'patterned', date: new Date() }] })

  const userToUpdate = await User.findById(req.userId)
  userToUpdate.userStockHistory.push(createdHistory)
  userToUpdate.unConfirmedPatterns.push(createdHistory.symbol)

  await userToUpdate.save();
  res.json(createdHistory)
});

const removePatternedStockFromUser = asyncHandler(async (req, res) =>
{
  const { historyId } = req.params

  const foundHistory = await StockHistory.findById(historyId)
  if (!foundHistory) res.status(404).json({ message: 'History Not Found' })

  const foundUser = await User.findById(foundHistory.userId)
  if (!foundUser) res.status(404).json({ message: 'User Not Found' })

  switch (foundHistory.history.at(-1).action)
  {
    case "patterned":
      foundUser.unConfirmedPatterns = foundUser.unConfirmedPatterns.filter((t) => t !== foundHistory.symbol)
      foundUser.userStockHistory = foundUser.userStockHistory.filter((t) => t.toString() !== historyId)
      break;

    case "confirmed":
      //should already be removed from user's unconfirmed pattern list at this stage
      foundUser.userStockHistory = foundUser.userStockHistory.filter((t) => t.toString() !== historyId)
      //remove from any other user lists
      break;

    case "charted":

      break;
  }

  await foundUser.save()
  const deletedHistory = await foundHistory.deleteOne();
  res.json(deletedHistory)
})

const fetchUsersUnconfirmedPatterns = asyncHandler(async (req, res) =>
{
  const foundUser = await User.findById(req.userId)
  if (!foundUser) return res.status(404).json({ message: 'User not found' })

  res.json(foundUser.unConfirmedPatterns)
})

module.exports = {
  addPatternedStockToUser,
  removePatternedStockFromUser,
  fetchUsersUnconfirmedPatterns
};
