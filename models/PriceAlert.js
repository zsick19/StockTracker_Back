const mongoose = require("mongoose");

const priceAlertSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, default: [], ref: "User" },
    chartId: { type: mongoose.Schema.Types.ObjectId, default: [], ref: "EnterExitPlannedStock" },
    price: { type: Number },
    ticker: String,
    priceBelow: Boolean,
    triggered: Boolean,
    seen: Boolean,
    dateCreated: { type: Date, default: new Date() }
})


module.exports = mongoose.model("PriceAlert", priceAlertSchema);
