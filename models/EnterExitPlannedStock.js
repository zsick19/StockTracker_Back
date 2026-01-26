const mongoose = require("mongoose");


const enterExitPlannedStockSchema = new mongoose.Schema({
    tickerSymbol: { type: String, required: true },
    sector: { type: String },
    plan: {
        enterBufferPrice: Number,
        enterPrice: Number,
        stopLossPrice: Number,
        exitBufferPrice: Number,
        exitPrice: Number,
        moonPrice: Number,
        risk: Number,
        reward: Number,
        percents: [Number],
        dateCreated: Date
    },
    initialTrackingPrice: Number,
    priceHitSinceTracked: { type: Number, default: 0 },
    highImportance: Date,
    dateAdded: { type: Date, default: new Date() },
    chartedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("PlannedStock", enterExitPlannedStockSchema);
