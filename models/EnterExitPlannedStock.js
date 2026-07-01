const mongoose = require("mongoose");
const relevantPriceSchema = new mongoose.Schema({

    dateHit: Date,
    price: Number
}, { _id: false })

const pointsSchema = new mongoose.Schema({
    date: Date,
    price: Number
}, { _id: false })

const highLowSlotSchema = new mongoose.Schema({
    highProb: Number,
    lowProb: Number
}, { _id: false })


const supportResistanceSchema = new mongoose.Schema({
    priceLevel: Number,
    volumePct: Number,
    frictionRating: String
}, { _id: false })

const enterExitPlannedStockSchema = new mongoose.Schema({
    tickerSymbol: { type: String, required: true },
    stockId: { type: mongoose.Schema.Types.ObjectId, ref: "Stock" },
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
    relevantCandleDate: Date,
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
    institutionalPricePoints: [relevantPriceSchema],
    relevantHighs: [relevantPriceSchema],
    relevantLows: [relevantPriceSchema],
    priceAlerts: [{ type: mongoose.Schema.Types.ObjectId, default: [], ref: "PriceAlert" }],

    dailyTickerValues: {
        atr: Number,
        rsi: Number,
        ema9: Number,
        ema50: Number,
        ema200: Number,
        spyBetaValue: Number,
        PrevDailyBar: {
            ClosePrice: Number,
            HighPrice: Number,
            LowPrice: Number,
            OpenPrice: Number,
            Timestamp: Date,
            Volume: Number,
        },
        DailyBar: {
            ClosePrice: Number,
            HighPrice: Number,
            LowPrice: Number,
            OpenPrice: Number,
            Timestamp: Date,
            Volume: Number,
        }
    },

    correlationValues: {
        SPY: { correlation30Day: Number, correlation90Day: Number, isCoreCoIntegrationValid: Boolean, isCurrentlyDecoupled: Boolean },
        IWM: { correlation30Day: Number, correlation90Day: Number, isCoreCoIntegrationValid: Boolean, isCurrentlyDecoupled: Boolean },
        QQQ: { correlation30Day: Number, correlation90Day: Number, isCoreCoIntegrationValid: Boolean, isCurrentlyDecoupled: Boolean },
        DIA: { correlation30Day: Number, correlation90Day: Number, isCoreCoIntegrationValid: Boolean, isCurrentlyDecoupled: Boolean },
        sector: { correlation30Day: Number, correlation90Day: Number, isCoreCoIntegrationValid: Boolean, isCurrentlyDecoupled: Boolean },
    },
    greatestCorrelation: String,

    maintainLiveCandles: Boolean,

    extentProb: {
        openH: Number,
        openL: Number,
        midH: Number,
        midL: Number,
        closeH: Number,
        closeL: Number,
    },
    extremeProbByFiveMin: [highLowSlotSchema],
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

    volumeProfileMetrics: {
        overHeadResistance: [supportResistanceSchema],
        underlyingSupport: [supportResistanceSchema]
    },

    optionsExpectedMoves: {
        weekly: {
            putWall: Number,
            callWall: Number,
            putCallRatio: Number,
            upperExpectedBounds: Number,
            lowerExpectedBounds: Number,
        },
        monthly: {
            putWall: Number,
            callWall: Number,
            putCallRatio: Number,
            upperExpectedBounds: Number,
            lowerExpectedBounds: Number
        },
        // CENTRAL TIME-DECAY CONTROL POINTERS
        metadata: {
            targetExpirationDate: String,      // Format: "2026-07-17"
            daysRemainingToExpiration: Number, // Computed integer difference
            isExpirationImminent: Boolean,      // True strictly when daysRemaining <= 5
            lastReCalibratedTimestamp: Date
        }
    },
    dateOptionsEMLastCalculated: Date,
    dateMorningMetricsLastCalculated: Date,
    dateVolumeProfileLastCalculated: Date,

    absorptionWindowMetrics: {
        averageMinutesInStrikeZone: Number,
        maxConsecutiveMinutesInZone: Number,
        executionVelocityRating: String
    },
    dateAbsorptionWindowLastCalculated: Date,

    retailVsInstitutionMetrics: {
        inZoneTradeCount: Number,
        inZoneLargeVsSmallRatio: Number,
        inZoneParticipantRegime: String,
        outOfZoneLargeVsSmallRatio: Number,
        outOfZoneParticipantRegime: String
    },
    dateRvILastCalculated:Date,

    cascadePattern: {
        points: { type: [pointsSchema], default: undefined },
        projection: {
            patternPocCeiling: Number,
            avgDropGainPercent: Number,
            avgDownDuration: Number,
            anchorPeak: Number,
            priceIdeal: Number,
            projectedDate: Date,
            priceFloor: Number,
            priceCeiling: Number,
            buffer: Number,
        },
        anchorDate: Date,
    },
    channelPattern: {
        channelType: String,
        channelBottom: Number,
        channelTop: Number,
        channelHeight: Number,
        entryStrikeBuffer: Number,
        stopLossBufferMultiplier: Number,
        requiredVolumeMultiplier: Number,
        anchorDate: Date
    },
    continuationPattern: {
        trendHealthScore: Number,
        calculatedDailyGrowthRate: Number,
        entryTrigger: Number,
        invalidationStop: Number,
        anchorDate: Date,
        anchorMidPrice: Number,
        projection: {
            oneDay: {
                projectedTargetPrice: Number,
                expectedTotalGainPercent: Number,
                confidenceScore: Number,
                classification: String
            },
            twoDays: {
                projectedTargetPrice: Number,
                expectedTotalGainPercent: Number,
                confidenceScore: Number,
                classification: String
            },
            threeDays: {
                projectedTargetPrice: Number,
                expectedTotalGainPercent: Number,
                confidenceScore: Number,
                classification: String
            }
        }
    },
    patternClassification: String,
    datePatternLastCalculated: Date,

    dateAdded: { type: Date, default: new Date() },
    chartedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    initialTrackingPrice: Number,
    tradeEnterDate: Date,
    with1000DollarsIdealGain: Number,

    // idealGPS: Number,
    // priceHitSinceTracked: { type: Number, default: 0 },
});

module.exports = mongoose.model("PlannedStock", enterExitPlannedStockSchema);
