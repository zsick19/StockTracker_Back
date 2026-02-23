const mongoose = require("mongoose");


const usersStockHistory = new mongoose.Schema({
    action: String,
    date: Date
}, { _id: false })

const stockHistorySchema = new mongoose.Schema({
    symbol: String,
    chartId: { type: mongoose.Schema.Types.ObjectId, ref: "ChartableStock" },
    mostRecentHistory: { type: usersStockHistory, default: { action: 'patterned', date: Date.now() } },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, require: true }
});

module.exports = mongoose.model("StockHistory", stockHistorySchema);
