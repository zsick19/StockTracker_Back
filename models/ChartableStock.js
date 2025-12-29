const mongoose = require("mongoose");

const chartableStockSchema = new mongoose.Schema({
  tickerSymbol: { type: String, required: true },
  sector: { type: String },
  keyLevelsCharted: { type: Boolean, default: false },
  chartedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("ChartableStock", chartableStockSchema);
