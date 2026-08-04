const mongoose = require("mongoose");

const journalRecordsSchema = new mongoose.Schema({

  // title: { type: String, required: true },
  // tickersContained: [{ _id: String, ticker: String, tickerTitle: String, keep: Boolean },],
  // useCase: { type: String, immutable: true },
  category: { type: String },
  entry: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  dateRecorded: Date
});

module.exports = mongoose.model("JournalRecord", journalRecordsSchema);
