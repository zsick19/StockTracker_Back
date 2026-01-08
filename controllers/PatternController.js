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

const syncConfirmRemovePatterns = asyncHandler(async (req, res) =>
{
  const { confirmed, remove } = req.body
  const foundUser = await User.findById(req.userId).populate('userStockHistory')


  let unconfirmedCopySet = foundUser.unConfirmedPatterns

  if (confirmed.length > 0)
  {
    //create new confirmed stocks/chartable stocks and add to user object
    let confirmToBeCreated = confirmed.map((ticker) => { return { tickerSymbol: ticker, chartedBy: foundUser._id } })
    let results = await ChartableStock.insertMany(confirmToBeCreated)
    foundUser.confirmedStocks = foundUser.confirmedStocks.concat(results)

    //remove these confirmed tickers from the users unConfirmedPattern list
    unconfirmedCopySet = foundUser.unConfirmedPatterns.filter((t) => confirmed.indexOf(t) === -1)

    //update the user's stock history to reflect being confirmed
    let date = new Date()
    let stockHistoryIdForUpdate = []
    foundUser.userStockHistory.map((history) => { if (confirmed.includes(history.symbol)) { stockHistoryIdForUpdate.push(history._id) } })
    await StockHistory.updateMany({ _id: { $in: stockHistoryIdForUpdate } }, { $push: { "history": { action: 'confirmed', date } } })
  }


  if (remove.length > 0)
  {
    //remove the "remove" tickers from the users unConfirmedPattern List
    unconfirmedCopySet = unconfirmedCopySet.filter(t => remove.indexOf(t) === -1)

    //remove the stock histories from the db
    let stockHistoryIdForDeletion = []
    foundUser.userStockHistory.map((history) => { if (remove.includes(history.symbol)) { stockHistoryIdForDeletion.push(history._id) } })
    const results = await StockHistory.deleteMany({ _id: { $in: stockHistoryIdForDeletion } })

    //filter the user's list of stock history for the newly deleted Ids
    if (results) foundUser.userStockHistory = foundUser.userStockHistory.filter(t => stockHistoryIdForDeletion.indexOf(t._id) === -1)
    }


  foundUser.unConfirmedPatterns = unconfirmedCopySet
  foundUser.markModified('unConfirmedPatterns')
  await foundUser.save()



  res.json(foundUser)
})


module.exports = {
  addPatternedStockToUser,
  removePatternedStockFromUser,
  fetchUsersUnconfirmedPatterns,
  syncConfirmRemovePatterns
};
