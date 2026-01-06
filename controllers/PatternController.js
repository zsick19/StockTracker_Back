const ChartableStock = require("../models/ChartableStock");
const StockHistory = require("../models/StockHistory");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const { ObjectId } = require("mongodb");
const addPatternedStockToUser = asyncHandler(async (req, res) =>
{
  const ticker = req.query.patternToAdd
  const addOrRemove = req.query.addOrRemove

  if (addOrRemove)
  {
    const checkForDuplicate = await StockHistory.findOne({ symbol: ticker, userId: req.userId })
    if (checkForDuplicate) return res.status(400).json({ message: 'Pattern already exists.' })

    const createdHistory = await StockHistory.create({ symbol: ticker, userId: req.userId, history: [{ action: 'patterned', date: new Date() }] })

    const userToUpdate = await User.findById(req.userId)
    userToUpdate.userStockHistory.push(createdHistory)

    await userToUpdate.save();
    res.json(createdHistory)
  } else
  {
    res.json({ message: 'working on removing' })
  }


});



module.exports = {
  addPatternedStockToUser
};
