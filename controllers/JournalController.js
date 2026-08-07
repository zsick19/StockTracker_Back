const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const StockHistory = require("../models/StockHistory");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");
const { ObjectId } = require("mongodb");
const Alpaca = require('@alpacahq/alpaca-trade-api')
const { sendRabbitMessage, rabbitQueueNames } = require('../config/rabbitMQService')
const EnterExitPlannedStock = require('../models/EnterExitPlannedStock');
const TradeRecord = require("../models/TradeRecord");
const AccountPL = require('../models/AccountPL')
const MacroChartedStock = require('../models/MacroChartedStock');
const { isWeekend, previousFriday, previousThursday, subBusinessDays } = require("date-fns");
const Stock = require("../models/Stock");
const SPYGammaLog = require('../models/SPYGammaLog');
const JournalRecords = require("../models/JournalRecords");

const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });



const createJournalEntry = asyncHandler(async (req, res) =>
{
  const { journalEntry, journalEntryCategory } = req.body

  if (!req.userId) return res.status(400).send("missing information");
  try
  {
    const createdJournalResult = await JournalRecords.create({ category: journalEntryCategory, entry: journalEntry, dateRecorded: new Date(), user: req.userId })
    if (createdJournalResult)
    {
      const updateUser = await User.findByIdAndUpdate(req.userId, {
        $push: { journalEntries: createdJournalResult._id }
      })
    }

    res.json(createdJournalResult);
  } catch (error)
  {
    res.status(500).json({ message: 'Error creating journal entry.' })
  }
});

const removeJournalEntry = asyncHandler(async (req, res) =>
{
  const { journalId } = req.params
  console.log(journalId)
  if (!journalId) return res.status(400).send('Missing Required Information')

  const results = await JournalRecords.findByIdAndDelete(journalId)

  const updatedUser = await User.findByIdAndUpdate(req.userId, {
    $pull: { journalEntries: journalId }
  })
  res.json({ removedEntry: journalId })
})

module.exports = {
  createJournalEntry,
  removeJournalEntry
};
