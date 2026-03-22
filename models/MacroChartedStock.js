const mongoose = require("mongoose");

const dailyEMSchema = new mongoose.Schema({
    iVolDailyEMUpper: { type: Number },
    iVolDailyEMLower: { type: Number },
    dailyEMLower: { type: Number },
    dailyEMUpper: { type: Number },
    lastUpdated: { type: Date }
}, { _id: false })
const previousEMSchema = new mongoose.Schema({
    startDate: Date,
    upper: Number,
    lower: Number
}, { _id: false })
const weeklyEMSchema = new mongoose.Schema({
    iVolWeeklyEMUpper: { type: Number },
    iVolWeeklyEMLower: { type: Number },
    weeklyClose: { type: Number },
    sigma: { type: Number },
    lastUpdated: { type: Date },
    previousWeeklyEM: [previousEMSchema]
}, { _id: false })



const monthlyEMSchema = new mongoose.Schema({
    iVolMonthlyEMUpper: { type: Number },
    iVolMonthlyEMLower: { type: Number },
    monthLowerEM: { type: Number },
    monthUpperEM: { type: Number },
    monthlyClose: { type: Number },
    previousMonthlyEM: [previousEMSchema],
    sigma: { type: Number, default: null },
    lastUpdated: { type: Date }
}, { _id: false })
const quarterlyEMSchema = new mongoose.Schema({
    quarterlyLower: { type: Number },
    quarterlyUpper: { type: Number },
    previousQuarterlyEM: [previousEMSchema],
    lastUpdated: { type: Date }
}, { _id: false })

const standardDeviationSchema = new mongoose.Schema({
    sigma: Number,
    close: Number,
}, { _id: false })

const trendLineSchema = new mongoose.Schema({
    id: { type: Number },
    dateP1: { type: Date },
    priceP1: { type: Number },
    dateP2: { type: Date },
    priceP2: { type: Number },
    priceP3: { type: Number },
    priceP4: { type: Number },
    dateCreated: { type: Date }
}, { _id: false })
const freeLineSchema = new mongoose.Schema({
    id: { type: Number },
    dateP1: { type: Date },
    priceP1: { type: Number },
    dateP2: { type: Date },
    priceP2: { type: Number },
    dateCreated: { type: Date }
}, { _id: false })
const lineHSchema = new mongoose.Schema({
    id: { type: Number },
    dateP1: { type: Date },
    priceP1: { type: Number },
    dateCreated: { type: Date },
}, { _id: false })

const volumeNodeSchema = new mongoose.Schema({
    id: { type: Number },
    price: { type: Number },
    dateCreated: { type: Date }
}, { _id: false })

//planning schemas
const enterExitLineSchema = new mongoose.Schema({
    enterDate: { type: Date },
    enterPrice: { type: Number },
    enterBufferPrice: { type: Number },
    stopLossPrice: { type: Number },
    exitPrice: { type: Number },
    exitBufferPrice: { type: Number },
    moonPrice: { type: Number },
    percents: [Number],
    dateCreated: { type: Date }
}, { _id: false })

const supportResistanceSchema = new mongoose.Schema({
    id: { type: Number },
    priceP1: { type: Number },
    priceP2: { type: Number },
    isResistance: Boolean,
    dateCreated: { type: Date }
}, { _id: false })

const dailyZoneSchema = new mongoose.Schema({
    low: { type: Number },
    mid: { type: Number },
    high: { type: Number },
    close: { type: Number },
    range: { type: Number },
    trend: { type: Number },

}, { _id: false })



const macroChartedStockSchema = new mongoose.Schema({
    tickerSymbol: { type: String, required: true },
    tickerTitle: String,
    dailyEM: dailyEMSchema,
    weeklyEM: weeklyEMSchema,
    monthlyEM: monthlyEMSchema,
    quarterlyEM: quarterlyEMSchema,
    standardDeviation: standardDeviationSchema,
    dailyZone: dailyZoneSchema,
    gammaFlip: Number,
    oneDayToExpire: [Number],
    callWall: { type: Number },
    putWall: { type: Number },
    charting: {
        freeLines: [freeLineSchema],
        freeLinesId: { type: Number, default: 1 },
        trendLines: [trendLineSchema],
        trendLinesId: { type: Number, default: 1 },
        linesH: [lineHSchema],
        linesHId: { type: Number, default: 1 },
        highVolumeNodes: [volumeNodeSchema],
        highVolumeNodesId: { type: Number, default: 1 },
        lowVolumeNodes: [volumeNodeSchema],
        lowVolumeNodesId: { type: Number, default: 1 },
        enterExitLines: { type: enterExitLineSchema, default: {} },
        supportResistanceLines: [supportResistanceSchema],
        supportResistanceLinesId: { type: Number, default: 1 }
    },
    chartedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("MacroChartedStock", macroChartedStockSchema);
