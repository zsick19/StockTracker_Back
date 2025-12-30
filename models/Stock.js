const mongoose = require('mongoose')

const stockSchema = new mongoose.Schema({
    Symbol: { type: String, require: true },
    companyName: { type: String, require: false },
    marketCap: { type: Number, require: false },
    industry: { type: String, require: true },
    sector: { type: String, require: true },
    averageVolume: { type: Number, require: false }
})

module.exports = mongoose.model('Stock', stockSchema)