const ChartableStock = require("../models/ChartableStock");
const StockHistory = require("../models/StockHistory");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const { ObjectId } = require("mongodb");

const Alpaca = require('@alpacahq/alpaca-trade-api');
const Stock = require("../models/Stock");

const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });




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
      foundUser.userStockHistory = foundUser.userStockHistory.filter((t) => t.toString() !== historyId)
      break;
  }

  await foundUser.save()
  const deletedHistory = await foundHistory.deleteOne();
  res.json(deletedHistory)
})


const fetchUsersUnconfirmedPatterns = asyncHandler(async (req, res) =>
{
  const foundUser = await User.findById(req.userId).select('unConfirmedPatterns')
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
    let tickerSymbolsForConfirmed = []
    let confirmToBeCreated = confirmed.map((ticker) =>
    {
      tickerSymbolsForConfirmed.push(ticker.ticker)
      return { tickerSymbol: ticker.ticker, sector: ticker.sector, chartedBy: foundUser._id }
    })
    let results = await ChartableStock.insertMany(confirmToBeCreated)
    foundUser.confirmedStocks = foundUser.confirmedStocks.concat(results)

    //remove these confirmed tickers from the users unConfirmedPattern list
    unconfirmedCopySet = foundUser.unConfirmedPatterns.filter((t) => tickerSymbolsForConfirmed.indexOf(t) === -1)

    //update the user's stock history to reflect being confirmed
    let stockHistoryIdForUpdate = []
    foundUser.userStockHistory.map((history) => { if (tickerSymbolsForConfirmed.includes(history.symbol)) { stockHistoryIdForUpdate.push(history._id) } })
    await StockHistory.updateMany({ _id: { $in: stockHistoryIdForUpdate } }, { $push: { "history": { action: 'confirmed', date: new Date() } } })
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


const addConfirmedTickerDirectlyToUser = asyncHandler(async (req, res) =>
{
  const tickerToAdd = req.query.tickerToAdd
  if (!tickerToAdd || tickerToAdd === '') return res.status(400).json({ message: 'Missing required information.' })

  const checkForPatterDuplicate = await ChartableStock.findOne({ tickerSymbol: tickerToAdd, chartedBy: req.userId })
  if (checkForPatterDuplicate) return res.status(400).json({ message: 'Stock Chart Already Exists for this user' })

  const foundUser = await User.findById(req.userId).populate('userStockHistory')
  if (!foundUser) return res.status(404).json({ message: 'Data Not Found' })

  try
  {
    await alpaca.getLatestTrade(tickerToAdd)
    const tickerStockInfo = await Stock.find({ Symbol: tickerToAdd })

    if (!tickerStockInfo) throw new Error()

    const directConfirmed = await ChartableStock.create({ tickerSymbol: tickerToAdd, sector: tickerStockInfo.Sector, chartedBy: foundUser._id, status: -1 })

    foundUser.unConfirmedPatterns.filter((t) => t !== tickerToAdd)
    foundUser.markModified('unConfirmedPatterns')
    foundUser.confirmedStocks.push(directConfirmed._id)
    foundUser.markModified('confirmedStocks')

    let possibleHistoryUpdateId = undefined
    foundUser.userStockHistory.forEach((history) => { if (tickerToAdd === history.symbol) { possibleHistoryUpdateId = history._id; return } })

    if (possibleHistoryUpdateId)
    {
      await StockHistory.updateOne({ _id: { $in: possibleHistoryUpdateId } }, { $push: { "history": { action: 'confirmed', date: new Date() } } })
    } else
    {
      const createdHistory = await StockHistory.create({ symbol: tickerToAdd, userId: req.userId, history: [{ action: 'confirmed', date: new Date() }] })
      foundUser.userStockHistory.push(createdHistory)
      foundUser.markModified('userStockHistory')
    }

    await foundUser.save()
    res.json({ directConfirmed, userHistory: foundUser.userStockHistory })

  } catch (error)
  {
    return res.status(400).json({ message: 'Ticker is not valid' })
  }
})

const addListOfTickersDirectlyToUser = asyncHandler(async (req, res) =>
{
  const tickersToAdd = req.body
  if (!tickersToAdd || tickersToAdd.length === 0) return res.status(400).json({ message: 'Missing required information.' })

  const foundUser = await User.findById(req.userId).populate('userStockHistory')
  if (!foundUser) return res.status(404).json({ message: 'Data Not Found' })

  let foundTickersToAdd = []
  let tickersNotAbleToAdd = []
  let justTheAddedTicker = []
  for (const ticker of tickersToAdd)
  {
    try
    {
      await alpaca.getLatestTrade(ticker)
      const tickerStockInfo = await Stock.findOne({ Symbol: ticker })
      if (!tickerStockInfo) tickersNotAbleToAdd.push(ticker)

      const checkForPatterDuplicate = await ChartableStock.findOne({ tickerSymbol: ticker, chartedBy: req.userId })
      if (checkForPatterDuplicate) tickersNotAbleToAdd.push(ticker)
      else
      {
        foundTickersToAdd.push({ tickerSymbol: ticker, sector: tickerStockInfo.Sector, chartedBy: foundUser._id, status: -1 })
        justTheAddedTicker.push(ticker)
      }
    } catch (error)
    {
      console.log(error)
    }
  }

  if (foundTickersToAdd.length === 0) return res.json({ message: 'No Tickers were able to be added.' })

  const directConfirmed = await ChartableStock.insertMany(foundTickersToAdd)
  if (directConfirmed.length === 0) return res.json({ message: 'No Tickers were added' })

  let usersUnConfirmedPatterns = foundUser.unConfirmedPatterns
  let filteredUnConfirmedPatternResult = [...new Set(usersUnConfirmedPatterns).symmetricDifference(new Set(justTheAddedTicker))]
  foundUser.unConfirmedPatterns = filteredUnConfirmedPatternResult
  foundUser.markModified('unConfirmedPatterns')


  let possibleHistoryUpdateIds = []
  directConfirmed.map((confirmed) =>
  {
    foundUser.confirmedStocks.push(confirmed._id)
    foundUser.userStockHistory.forEach((history) => { if (confirmed.tickerSymbol === history.symbol) { possibleHistoryUpdateIds.push(history._id); return } })
  })
  foundUser.markModified('confirmedStocks')


  if (possibleHistoryUpdateIds.length > 0)
  {
    const result = await StockHistory.updateMany({ _id: { $in: possibleHistoryUpdateIds } }, { $push: { "history": { action: 'confirmed', date: new Date() } } })
  } else
  {
    let historiesToBeCreated = directConfirmed.map((confirmed) => { return { symbol: confirmed.tickerSymbol, userId: req.userId, history: [{ action: 'confirmed', date: new Date() }] } })
    const createdHistory = await StockHistory.insertMany(historiesToBeCreated)
    foundUser.userStockHistory.push(createdHistory)
    foundUser.markModified('userStockHistory')
  }

  await foundUser.save()
  res.json({ directConfirmed, userHistory: foundUser.userStockHistory })
})


module.exports = {
  addPatternedStockToUser,
  removePatternedStockFromUser,
  fetchUsersUnconfirmedPatterns,
  addConfirmedTickerDirectlyToUser,
  addListOfTickersDirectlyToUser,
  syncConfirmRemovePatterns
};
