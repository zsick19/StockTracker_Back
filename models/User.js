const mongoose = require("mongoose");
const StockHistory = require("./StockHistory");
const TradeRecord = require("./TradeRecord");



const marketSearchFilter = new mongoose.Schema({
  title: String,
  filterParams: {
    Sector: String
  }
}, { _id: false })


const userSchema = new mongoose.Schema({
  spyChartId: { type: mongoose.Schema.Types.ObjectId, ref: "ChartableStock" },

  confirmedStocks: [{ type: mongoose.Schema.Types.ObjectId, default: [], ref: "ChartableStock" }],
  planAndTrackedStocks: [{ type: mongoose.Schema.Types.ObjectId, default: [], ref: "PlannedStock" }],

  macroChartedStocks: [{ type: mongoose.Schema.Types.ObjectId, ref: "MacroChartedStock" }],
  defaultMacroWatchLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "WatchList" }],
  
  macroWatchLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "WatchList" }],


  marketSearchFilters: [{ type: marketSearchFilter, default: [] }],
  personalWatchLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "WatchList" }],

  unConfirmedPatterns: [{ type: String, default: [] }],
  userStockHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StockHistory', default: [] }],

  activeTradeRecords: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TradeRecord', default: [] }],
  previousTradeRecords: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TradeRecord', default: [] }]
});

module.exports = mongoose.model("User", userSchema);

