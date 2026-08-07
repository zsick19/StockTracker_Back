const mongoose = require('mongoose')


const purchaseSchema = new mongoose.Schema({
    purchasePrice: { type: Number },
    positionSize: { type: Number },
    sharesRemaining: Number,
    transactionDate: { type: Date },
}, { _id: false })

const sellSchema = new mongoose.Schema({
    sellPrice: { type: Number },
    sellSize: { type: Number },
    transactionDate: { type: Date },
}, { _id: false })


const backTestedLedgerSchema = new mongoose.Schema({
    details: {
        wasExitHit: Boolean,
        wasStopHit: Boolean,
        tradeDate: Date,
        holdDays: Number,
        closeOrHoldTillDate: Date,
    },
    gain: {
        maxGain: Number,
        highestValue: Number,
        highestValuePercent: Number,
        missedGain: Number,
        dateOfHighestValue: Date
    },
    pain: {
        maxPain: Number,
        avoidedPain: Number,
        lowestValue: Number,
        lowestValuePercent: Number,
        dateOfLowestValue: Date
    }
}, { _id: false })

const backTestedAverageSchema = new mongoose.Schema({
    averageHoldTime: Number,
    averageMaxGain: Number,
    averageGainPercent: Number,
    averageMaxPain: Number,
    averagePainPercent: Number,
    averageMissGain: Number,
    averageSavedPain: Number,

    totalNumberOfTrades: Number,
    numberOfStoplossHitTrades: Number,
    numberOfClosedTrades: Number,
    numberOfOpenTrades: Number,

    tradesSinceTracking: Number,
    successfulOpportunitiesSinceTracking: Number,
    patternLength: Number,
    daysBetweenTrades: [Number],
    averageDaysBetweenTrades: Number,
    daysBetweenSuccessfulTrades: [Number],
    averageDaysBetweenSuccessfulTrades: Number,

    patternMaxGain: Number,
    patternMaxPain: Number,
    positionReward: Number,
    positionRisk: Number,
    lowestPatternValue: Number,
    highestPatternValue: Number
}, { _id: false })



const tradeRecordSchema = new mongoose.Schema({
    tickerSymbol: { type: String, require: true },
    enterExitPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlannedStock', },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', },

    purchaseRecords: [purchaseSchema],
    sellRecords: [sellSchema],

    availableShares: { type: Number, default: 0 },
    averagePurchasePrice: { type: Number },
    averageSellPrice: { type: Number },

    enterDate: { type: Date },
    exitDate: { type: Date },

    averagePriceDateBackTests: {
        backTests: [backTestedLedgerSchema],
        averages: backTestedAverageSchema
    },






    sector: { type: String },
    industry: { type: String },
    exitGain: { type: Number },//exit price times total shares sold
    exitGainPercent: { type: Number }, //enter price gain    
    exitMovePercent: Number, //how much of the move did we capture

    idealTotalGain: Number,
    idealTotalRisk: Number,
    tradeComplete: { type: Boolean, default: false },

    // idealPercents: [Number],
    // tradingPlanPrices: [Number],
    // relevantCandleDate: Date,
    // atrAtPurchase: Number,
    // daysToCover: Number,
    // atr: Number,
    // rsi: Number,
    // dailyEma: {
    //     ema9: Number,
    //     ema50: Number,
    //     ema200: Number
    // },
    // extentProb: {
    //     openH: Number,
    //     openL: Number,
    //     midH: Number,
    //     midL: Number,
    //     closeH: Number,
    //     closeL: Number
    // },
})

module.exports = mongoose.model('TradeRecord', tradeRecordSchema)