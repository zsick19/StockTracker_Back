const mongoose = require("mongoose");

const monthlyPLSchema = new mongoose.Schema({
    monthStartDate: Date,
    closedPL: Number,
    numberOfTradesClosed: Number,
    closedTradeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TradeRecord', default: [] }]
}, { _id: false })

const dailyPLSchema = new mongoose.Schema({
    closeDate: Date,
    closedPL: Number,
    numberOfTradesClosed: Number,
    closedTradeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TradeRecord', default: [] }]
}, { _id: false })

const depositWithdrawsSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    amount: Number,
    depositOrWithdraw: String
}, { _id: false })




const accountPLSchema = new mongoose.Schema({
    accountDeposit: Number,
    cashBalance: Number,
    maxLossPerTradePercent: Number,
    maxLossPerTradeDollar: Number,
    activeTrades: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TradeRecord', default: [] }],
    depositOrWithdraw: [depositWithdrawsSchema],
    monthlyPL: [monthlyPLSchema],
    dailyPL: [dailyPLSchema],
    currentPositionRisk: Number,
    riskThreshold: Number
});

module.exports = mongoose.model("AccountPL", accountPLSchema);
