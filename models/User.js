const mongoose = require("mongoose");
const StockHistory = require("./StockHistory");



const marketSearchFilter = new mongoose.Schema({
  title: String,
  filterParams: {
    Sector: String
  }
}, { _id: false })


const userSchema = new mongoose.Schema({
  spyChartId: { type: mongoose.Schema.Types.ObjectId, ref: "ChartableStock" },
  marketSearchFilters: [{ type: marketSearchFilter, default: [] }],
  userStockHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StockHistory', default: [] }],
  defaultMacroWatchLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "WatchList" }],
  macroWatchLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "WatchList" }],
  personalWatchLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "WatchList" }],
});

module.exports = mongoose.model("User", userSchema);
