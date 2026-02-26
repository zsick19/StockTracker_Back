const mongoose = require("mongoose");

const watchListSchema = new mongoose.Schema({
  title: { type: String, required: true },
  tickersContained: [{ _id: String, ticker: String, tickerTitle: String, keep: Boolean },],
  useCase: { type: String, immutable: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("WatchList", watchListSchema);
