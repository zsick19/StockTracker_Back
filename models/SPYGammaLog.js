const mongoose = require('mongoose')

const spyGammaLogSchema = new mongoose.Schema({
    dateKey: { type: String, required: true, unique: true, trim: true },
    gammaFlipLinePrice: { type: Number, required: true },
    gammaRegimeClassification: { type: String, enum: ['GAMMA_POSITIVE', 'GAMMA_NEGATIVE', 'GAMMA_NEUTRAL'], required: true },


    netGammaExposureValue: { type: Number, required: false }, // Mapped in billions or millions (e.g., -1.24)
    spyClosingPrice: { type: Number, required: false },
})

spyGammaLogSchema.index({ dateKey: -1 }, { unique: true })

module.exports = mongoose.model('SpyGammaLog', spyGammaLogSchema)