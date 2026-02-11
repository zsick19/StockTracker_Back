const mongoose = require('mongoose')

const stockSchema = new mongoose.Schema({
    Symbol: { type: String, require: true },
    CompanyName: String,
    Industry: String,
    MarketCap: Number,
    AvgVolume: Number,
    ATR: Number,
    Sector: String,
    Volume: Number,
    Country: String,
    NextEarnings: Date,
    EarningsDate: Date,
    LastEarnings: Date
})

module.exports = mongoose.model('Stock', stockSchema)