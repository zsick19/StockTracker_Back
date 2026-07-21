const mongoose = require("mongoose");
const StockHistory = require("./StockHistory");
const TradeRecord = require("./TradeRecord");



const marketSearchFilter = new mongoose.Schema({
  title: String,
  filterParams: {
    Sector: String
  }
}, { _id: false })

const marketSearchProgressSchema = new mongoose.Schema({
  mostRecentPage: Number,
  filterParams: {
    type: Map, of: String
  },
  resultsPerPage: Number
}, { _id: false })

const dailyTask = new mongoose.Schema({
  status: Date,
  title: String,
  time: String
}, { _id: true })

const userSchema = new mongoose.Schema({

  accountPL: { type: mongoose.Schema.Types.ObjectId, ref: "AccountPL" },
  spyChartId: { type: mongoose.Schema.Types.ObjectId, ref: "ChartableStock" },

  oldestRelevantDateToFetch: Date,

  confirmedStocks: [{ type: mongoose.Schema.Types.ObjectId, default: [], ref: "ChartableStock" }],
  planAndTrackedStocks: [{ type: mongoose.Schema.Types.ObjectId, default: [], ref: "PlannedStock" }],

  macroChartedStocks: [{ type: mongoose.Schema.Types.ObjectId, ref: "MacroChartedStock" }],
  defaultMacroWatchLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "WatchList" }],

  macroWatchLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "WatchList" }],
  priceAlerts: [{ type: mongoose.Schema.Types.ObjectId, default: [], ref: "PriceAlert" }],

  marketSearchFilters: [{ type: marketSearchFilter, default: [] }],
  marketSearchProgress: { type: marketSearchProgressSchema },
  personalWatchLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "WatchList" }],

  unConfirmedPatterns: [{ type: String, default: [] }],
  userStockHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StockHistory', default: [] }],

  activeTradeRecords: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TradeRecord', default: [] }],
  previousTradeRecords: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TradeRecord', default: [] }],

  dailyTasks: {
    preMarket: [{
      type: dailyTask, default: [
        { title: 'News Review For Current Trades', time: '08:00' },
        { title: 'Review Trade Positions', time: '08:00' },
        { title: 'Place Trade Exit Limit Orders', time: '08:30' },
        { title: 'Supply Weekly Macro EM', time: '09:15' },
        { title: 'Supply Daily Macro EM', time: '09:15' },
        { title: 'Supply Daily Macro Zones', time: '09:15' },
        { title: 'Supply SPY Gamma Values', time: '09:20' },
        { title: 'Upload Stock Analysis CSV', time: '09:25' }
      ]
    }],
    firstHour: [{
      type: dailyTask, default: [
        { title: 'Lock Opening Cross Inflow Axis', time: '09:31' },
        { title: 'Opening Cross Block Volume Audit', time: '09:32' },
        { title: 'Opening Drive Variance Cool-Down', time: '09:35' },
        { title: 'Evaluate Early Initial Rally Breaches', time: '09:40' },
        { title: 'Evaluate Early Initial Drop Breaches', time: '09:40' },
        { title: 'Track Volumetric Climax Reversals', time: '09:50' },
        { title: 'Monitor 5-Min Interval Low Prints', time: '09:55' },
        { title: 'Verify Cap-Weighted SPY/RSP Decay', time: '10:15' }
      ]
    }],
    midDay: [{
      type: dailyTask, default: [
        { title: 'Review First Hour Positions', time: '10:30' },
        { title: 'Sector Rotation Check', time: '10:40' },
        { title: 'Market Search 25 Pages', time: '10:45' },
        { title: 'Confirm Patterns', time: '11:00' },
        { title: 'Chart Patterns', time: '11:15' },
        { title: 'Lock Midday Standby Interdiction Gate', time: '11:30' },
        { title: 'Polish Code', time: '12:00' },
        { title: 'Monitor Lunch Volume Exhaustion Voids', time: '12:30' },
        { title: 'Audit Liquidity Fracture Spread Risks', time: '12:45' },
        { title: 'Go Through Alert Review', time: '13:00' },
        { title: 'Audit Deep Discount Staging Tray', time: '13:30' },
        { title: 'Calibrate User-Guided Stepper Tiers', time: '14:00' }

      ]
    }],
    powerHour: [{
      type: dailyTask, default: [
        { title: 'Verify Thu/Friday Gamma Pinning Walls', time: '15:00' },
        { title: 'Track Overarching 5-Min Cubic Slopes', time: '15:15' },
        { title: 'Cross-Check Multi-Timeframe Delta Shifts', time: '15:30' },
        { title: 'Audit Active Time-to-Yield Durations', time: '15:45' },
        { title: 'Execute Automated Limit Target Fills', time: '15:55' }
      ]
    }],
    postClose: [{
      type: dailyTask, default: [
        { title: 'Deactivate High-Speed Quote Sockets', time: '16:01' },
        { title: 'Download Daily Consolidated Tape logs', time: '16:15' },
        { title: 'Compute True Multi-Day Trapped Volume', time: '16:45' },
        { title: 'Run Backtest Fatigue & Spacing Crons', time: '17:30' },
        { title: 'Cache Daily SPY Gamma Position Rows', time: '18:00' },
        { title: 'Map Systemic Stress Synchronicity Tags', time: '18:30' }
      ]
    }]
  }
});

module.exports = mongoose.model("User", userSchema);

