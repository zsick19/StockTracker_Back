const mongoose = require('mongoose')


const purchaseSchema = new mongoose.Schema({
    purchasePrice: { type: Number },
    positionSize: { type: Number },
    purchaseDate: { type: Date },
}, { _id: false })

const sellSchema = new mongoose.Schema({
    sellPrice: { type: Number },
    sellSize: { type: Number },
    sellDate: { type: Date },
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