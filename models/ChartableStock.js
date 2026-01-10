const mongoose = require("mongoose");

const dailyEMSchema = new mongoose.Schema({
  iVolDailyEMUpper: { type: Number },
  iVolDailyEMLower: { type: Number },
  dailyClose: { type: Number },
  sigma: { type: Number },
  lastUpdated: { type: Date }
}, { _id: false })

const weeklyEMSchema = new mongoose.Schema({
  iVolWeeklyEMUpper: { type: Number },
  iVolWeeklyEMLower: { type: Number },
  weeklyClose: { type: Number },
  sigma: { type: Number },
  lastUpdated: { type: Date }
}, { _id: false })

const monthlyEMSchema = new mongoose.Schema({
  iVolMonthlyEMUpper: { type: Number },
  iVolMonthlyEMLower: { type: Number },
  monthlyClose: { type: Number },
  sigma: { type: Number },
  lastUpdated: { type: Date }
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
  dailyEM: dailyEMSchema,
  weeklyEM: weeklyEMSchema,
  monthlyEM: monthlyEMSchema,
  standardDeviation: standardDeviationSchema,
  gammaFlip: Number,
  oneDayToExpire: [Number],
  callWall: { type: Number },
  putWall: { type: Number },
  useCase: { type: String, immutable: true },
  plannedId: { type: mongoose.Schema.Types.ObjectId, ref: "PlannedStock" },
  status: Number,
  dateAdded: { type: Date, default: new Date() },
  chartedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("ChartableStock", chartableStockSchema);
