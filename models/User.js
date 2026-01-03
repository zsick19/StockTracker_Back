const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  spyChartId: { type: mongoose.Schema.Types.ObjectId, ref: "ChartableStock" },
  defaultMacroWatchLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "WatchList" }],
  macroWatchLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "WatchList" }],
  personalWatchLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "WatchList" }],
});

module.exports = mongoose.model("User", userSchema);
