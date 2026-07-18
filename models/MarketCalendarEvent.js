const mongoose = require('mongoose')

const marketCalendarEventSchema = new mongoose.Schema({
    dateKey: { type: String, required: true },
    eventName: { type: String, required: true },
    eventType: { type: String, enum: ['MARKET_CLOSED', 'CPI_REPORT', 'FED_MEETING'], required: true },
})

marketCalendarEventSchema.index({ dateKey: -1 }, { unique: true })

module.exports = mongoose.model('MarketCalendarEvent', marketCalendarEventSchema)