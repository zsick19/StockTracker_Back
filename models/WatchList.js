const mongoose = require("mongoose");

const watchListSchema = new mongoose.Schema({
  title: { type: String, required: true },
  tickersContained: [{ _id: String, ticker: String, },],
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("WatchList", watchListSchema);
