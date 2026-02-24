const mongoose = require("mongoose");


const stockHistorySchema = new mongoose.Schema({
    symbol: String,
    chartId: { type: mongoose.Schema.Types.ObjectId, ref: "ChartableStock" },
    mostRecentHistory: { type: String, default: 'patterned' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, require: true }
});

module.exports = mongoose.model("StockHistory", stockHistorySchema);
