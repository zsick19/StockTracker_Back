import mongoose from 'mongoose';

const macroCalendarEventSchema = new mongoose.Schema({
    // 🔒 THE UNIQUE CLAMP ANCHOR: Prevents duplicate ingestion entries (e.g., "US_FOMC_2026-07-30")
    eventUniqueKey: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    eventTitleStr: { type: String, required: true },
    eventDateIso: { type: Date, required: true },
    eventDateKeyStr: { type: String, required: true, index: true }, // Format: "YYYY-MM-DD" for fast string map joins

    // 🌐 TAXONOMY CLASSIFICATION VECTORS
    eventSubCategory: {
        type: String,
        enum: ['CENTRAL_BANKING', 'INFLATION_METRICS', 'EMPLOYMENT_LEDGER', 'COMMODITY_STRESS', 'GEO_POLITICAL'],
        required: true
    },

    // 📐 THE CONVEXITY DEVIATION DELTA MATRIX
    forecastValue: { type: Number, default: 0 },
    actualValue: { type: Number, default: 0 },
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
