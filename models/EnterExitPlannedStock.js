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
    with1000DollarsIdealGain: Number,
    idealGPS: Number,
    priceHitSinceTracked: { type: Number, default: 0 },
    highImportance: Date,
    tradeEnterDate: Date,
    updateNeededDate: Date,
    checkOffCriteria: {
        vpCheck: Boolean,
        rsiCheck: Boolean,
        macdCheck: Boolean,
        stochasticCheck: Boolean,
        vortexCheck: Boolean,
        volCheck: Boolean,
        emaCheck: Boolean
    },
    priceAlerts: [{ type: mongoose.Schema.Types.ObjectId, default: [], ref: "PriceAlert" }],
    dateAdded: { type: Date, default: new Date() },
    chartedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("PlannedStock", enterExitPlannedStockSchema);
