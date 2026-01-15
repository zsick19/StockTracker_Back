const mongoose = require('mongoose')


const purchaseSchema = new mongoose.Schema({
    purchasePrice: { type: Number },
    positionSize: { type: Number },
    purchaseDate: { type: Date, default:new Date() },
}, { _id: false })

const sellSchema = new mongoose.Schema({
    sellPrice: { type: Number },
    sellSize: { type: Number },
    sellDate: { type: Date },
}, { _id: false })

const tradeRecordSchema = new mongoose.Schema({
    tickerSymbol: { type: String, require: true },
    sector: { type: String },

    tradingPlanPrices: [Number],
    enterExitPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlannedStock', },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', },

    purchaseRecords: [purchaseSchema],
    sellRecords: [sellSchema],

    availableShares: { type: Number, default: 0 },

    averagePurchasePrice: { type: Number },
    averageSellPrice: { type: Number },

    exitGain: { type: Number },
    exitDate: { type: Date },
    exitPercentCapture: { type: Number },

    tradeComplete: { type: Boolean, default: false }
})

module.exports = mongoose.model('TradeRecord', tradeRecordSchema)