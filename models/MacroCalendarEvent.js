import mongoose from 'mongoose';

const macroCalendarEventSchema = new mongoose.Schema({
    // 🔒 THE UNIQUE CLAMP ANCHOR: Prevents duplicate ingestion entries (e.g., "US_FOMC_2026-07-30")
    eventUniqueKey: { type: String, required: true, unique: true, trim: true },

    eventTitle: { type: String, required: true },
    eventDateIso: { type: Date, required: true },
    eventDateKeyStr: { type: String, required: true, index: true }, // Format: "YYYY-MM-DD" for fast string map joins

    eventSubCategory: {
        type: String,
        enum: ['INTEREST_RATE', 'PRICES_&_INFLATION', 'LABOUR_MARKET', 'GDP_GROWTH', 'FOREIGN_TRADE', 'GOVERNMENT', 'BUSINESS_CONFIDENCE', 'CONSUMER_SENTIMENT', 'HOUSING_MARKET', 'BOND_AUCTIONS', 'ENERGY'],
        required: true
    },

    // 📐 THE CONVEXITY DEVIATION DELTA MATRIX
    actual: { type: Number, default: 0 },
    previous: { type: Number, default: 0 },
    consensus: { type: Number, default: 0 },
    forecast: { type: Number, default: 0 },
    unitType:{type:String, 
        enum:['%','$','Bcf','MXN','ARS','€','C$','¥','A$','CNY','S$','TRY','£','SAR']
    },

    deviationDeltaValue: { type: Number, default: 0 }, // Mathematically solved: Actual - Forecast
    importanceTierRating: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'LOW' },



    // 🌊 BROAD MARKET LIQUIDITY BENCHMARKS
    spyEventHourRangePct: { type: Number, default: 0 }, // Intraday high-low range of SPY following release
    vixEventHourDilationDelta: { type: Number, default: 0 }, // VIX expansion scalar
    lastHydratedDate: { type: Date, default: Date.now }
}, {
    collection: 'macro_calendar_events', // Isolated tray avoids database schema cross-contamination
    timestamps: true
});

// Enforce chronological sorting properties direct on disk for sub-millisecond query lookups
macroCalendarEventSchema.index({ eventDateKeyStr: -1, importanceTierRating: 1 });

export const MacroCalendarEvent = mongoose.model('MacroCalendarEvent', macroCalendarEventSchema);
