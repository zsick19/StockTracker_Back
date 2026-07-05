const mongoose = require('mongoose')

const stockSchema = new mongoose.Schema({
    Symbol: { type: String, require: true },
    CompanyName: String,
    Industry: String,
    MarketCap: Number,
    AvgVolume: Number,
    Sector: String,
    Country: String,
    Beta1Y: Number,
    NextEarnings: Date,
    LastEarnings: Date,
    EarningsDate: Date,
    SharesFloat: Number,
    ShortPercentOfFloat: Number,
    FloatPercentage: Number,
    High52W: Number,
    Low52W: Number,
    Low52WDate: Date,
    High52WDate: Date,
    HasOptions: Boolean,
    RelativeVolume: Number,
    MonthlyRsi: Number,
    DailyRsi: Number,
    MA20Price: Number,
    MA200Price: Number,
    InstitutionalSharePercent: Number,
    PreMarketPercentChange: Number,
    PreMarketVolume: Number,
    ShortRatioDaysToCover: Number,
    DaysGapPercent: Number,
    PositionInRangePercent: Number,
    ShortPercentOfShares: Number,
    Website: String,
    LastUpdated: Date
})

module.exports = mongoose.model('Stock', stockSchema)