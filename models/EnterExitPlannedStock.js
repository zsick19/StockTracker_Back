const mongoose = require("mongoose");
const relevantPriceSchema = new mongoose.Schema({

    dateHit: Date,
    price: Number
}, { _id: false })

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
    relevantCandleDate: { date: Date, created: Date },
    highImportance: Date,
    updateNeededDate: Date,
    watchForTomorrow: Date,
    checkOffCriteria: {
        vpCheck: Boolean,
        rsiCheck: Boolean,
        macdCheck: Boolean,
        stochasticCheck: Boolean,
        vortexCheck: Boolean,
        volCheck: Boolean,
        emaCheck: Boolean
    },
    greatestCorrelation: String,
    spyBetaValue: Number,
    correlationValues: {
        SPY: { correlation30Day: Number, correlation90Day: Number, isCoreCoIntegrationValid: Boolean, isCurrentlyDecoupled: Boolean },
        IWM: { correlation30Day: Number, correlation90Day: Number, isCoreCoIntegrationValid: Boolean, isCurrentlyDecoupled: Boolean },
        QQQ: { correlation30Day: Number, correlation90Day: Number, isCoreCoIntegrationValid: Boolean, isCurrentlyDecoupled: Boolean },
        DIA: { correlation30Day: Number, correlation90Day: Number, isCoreCoIntegrationValid: Boolean, isCurrentlyDecoupled: Boolean },
        sector: { correlation30Day: Number, correlation90Day: Number, isCoreCoIntegrationValid: Boolean, isCurrentlyDecoupled: Boolean },
    },
    dailyTickerValues: {
        atr: Number,
        rsi: Number,
        ema9: Number,
        ema50: Number,
        ema200: Number,
        PrevDailyBar: {
            ClosePrice: Number,
            HighPrice: Number,
            LowPrice: Number,
            TradeCount: Number,
            OpenPrice: Number,
            Timestamp: Date,
            Volume: Number,
            VWAP: Number
        },
        DailyBar: {
            ClosePrice: Number,
            HighPrice: Number,
            LowPrice: Number,
            TradeCount: Number,
            OpenPrice: Number,
            Timestamp: Date,
            Volume: Number,
            VWAP: Number
        },
        dateCalculated: Date,
        yesterDayHigh: Number,
        yesterDayClose: Number,
        yesterDayLow: Number,
        todayOpen: Number,
    },
    extentProb: {
        openH: Number,
        openL: Number,
        midH: Number,
        midL: Number,
        closeH: Number,
        closeL: Number,
        dateCalculated: Date
    },
    morningMetrics: {
        downSide: {
            sampleSizeDays: Number,
            averageInitialDropStretch: Number,
            averageTimeToBottom: { hour: Number, minute: Number },
            reboundProbability: Number,
            averageSuccessfulReboundExpansion: Number
        },
        upSide: {
            sampleSizeDays: Number,
            averageInitialRallyStretch: Number,
            averageTimeToPeak: { hour: Number, minute: Number },
            pullbackBelowOpenProbability: Number,
            averageSuccessfulPullbackSize: Number
        },
        dateCalculated: Date
    },
    morningVolumeMetrics: {
        upOpenDays: Number,
        downOpenDays: Number,
        avgUpVolToHighTime: Number,
        avgUpTotalVolToFirstHour: Number,
        avgDownTotalVolToFirstHour: Number,
        avgDownVolToLowTime: Number,
        fiveMinUpDay: [Number],
        preMarketUpThirtyMinBlocks: [Number],
        preMarketDownThirtyMinBlocks: [Number],
        tenMinUpDay: [Number],
        fiveMinDownDay: [Number],
        tenMinDownDay: [Number]
    },
    institutionalPricePoints: [relevantPriceSchema],
    relevantHighs: [relevantPriceSchema],
    relevantLows: [relevantPriceSchema],
    cascadePattern: {
        points: [{ date: Date, price: Number }],
        projection: { days: Number, percentDrop: Number }
    },
    channelPattern: {
        points: [{ date: Date, price: Number }],
        top: { date: Date, price: Number },
        bottom: { date: Date, price: Number }
    },
    continuationPattern: {
        points: [{ date: Date, price: Number }],
        top: { date: Date, price: Number },
        bottom: { date: Date, price: Number }
    },
    patternClassification: String,

    priceAlerts: [{ type: mongoose.Schema.Types.ObjectId, default: [], ref: "PriceAlert" }],
    dateAdded: { type: Date, default: new Date() },
    chartedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    initialTrackingPrice: Number,
    tradeEnterDate: Date,
    with1000DollarsIdealGain: Number,

    // idealGPS: Number,
    // priceHitSinceTracked: { type: Number, default: 0 },
});

module.exports = mongoose.model("PlannedStock", enterExitPlannedStockSchema);
