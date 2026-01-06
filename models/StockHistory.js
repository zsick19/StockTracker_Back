const mongoose = require("mongoose");


const usersStockHistory = new mongoose.Schema({
    action: String,
    date: Date
}, { _id: false })

const stockHistorySchema = new mongoose.Schema({
    symbol: String,
    chartId: { type: mongoose.Schema.Types.ObjectId, ref: "ChartableStock" },
    history: [{ type: usersStockHistory }],
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, require: true }
});

module.exports = mongoose.model("StockHistory", stockHistorySchema);
