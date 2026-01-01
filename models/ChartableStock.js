const mongoose = require("mongoose");

const weeklyEMSchema = new mongoose.Schema({
  iVolWeekEMUpper: { type: Number },
  upperWeeklyEM: { type: Number },
  lowerWeeklyEM: { type: Number },
  sigma2UpperWeeklyEM: { type: Number },
  sigma2LowerWeeklyEM: { type: Number },
  iVolWeekEMLower: { type: Number },
  weeklyEM: { type: Number },
  sigma2EM: { type: Number },
  weeklyClose: { type: Number },
  lastUpdated: { type: Date, default: new Date() }
}, { _id: false })

const dailyEMSchema = new mongoose.Schema({
  iVolDailyEMUpper: { type: Number },
  upperDailyEM: { type: Number },
  lowerDailyEM: { type: Number },
  iVolDailyEMLower: { type: Number },
  lastUpdated: { type: Date, default: new Date() }
}, { _id: false })

const monthlyEMSchema = new mongoose.Schema({
  upperMonthlyEM: { type: Number },
  lowerMonthlyEM: { type: Number }
}, { _id: false })

const standardDeviationSchema = new mongoose.Schema({
  sigma: Number,
  std1Upper: { type: Number },
  std2Upper: { type: Number },
  std1Lower: { type: Number },
  std2Lower: { type: Number },
})


const chartableStockSchema = new mongoose.Schema({
  tickerSymbol: { type: String, required: true },
  sector: { type: String },
  keyLevelsCharted: { type: Boolean, default: false },
  dailyEm: dailyEMSchema,
  weeklyEM: weeklyEMSchema,
  monthlyEM: monthlyEMSchema,
  standardDeviation: standardDeviationSchema,
  gammaFlipLine: Number,
  oneDayToExpire: [Number],
  callWall: { type: Number },
  putWall: { type: Number },
  chartedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("ChartableStock", chartableStockSchema);
