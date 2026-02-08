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

const trendLineSchema = new mongoose.Schema({
  id: { type: Number },
  dateP1: { type: Date },
  priceP1: { type: Number },
  dateP2: { type: Date },
  priceP2: { type: Number },
  priceP3: { type: Number },
  priceP4: { type: Number },
  dateCreated: { type: Date }
}, { _id: false })
const freeLineSchema = new mongoose.Schema({
  id: { type: Number },
  dateP1: { type: Date },
  priceP1: { type: Number },
  dateP2: { type: Date },
  priceP2: { type: Number },
  dateCreated: { type: Date }
}, { _id: false })
const lineHSchema = new mongoose.Schema({
  id: { type: Number },
  dateP1: { type: Date },
  priceP1: { type: Number },
  dateCreated: { type: Date },
}, { _id: false })

const volumeNodeSchema = new mongoose.Schema({
  id: { type: Number },
  price: { type: Number },
  dateCreated: { type: Date }
}, { _id: false })

//planning schemas
const enterExitLineSchema = new mongoose.Schema({
  enterDate: { type: Date },
  enterPrice: { type: Number },
  enterBufferPrice: { type: Number },
  stopLossPrice: { type: Number },
  exitPrice: { type: Number },
  exitBufferPrice: { type: Number },
  moonPrice: { type: Number },
  percents: [Number],
  dateCreated: { type: Date }
}, { _id: false })



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
  charting: {
    freeLines: [freeLineSchema],
    freeLinesId: { type: Number, default: 1 },
    trendLines: [trendLineSchema],
    trendLinesId: { type: Number, default: 1 },
    linesH: [lineHSchema],
    linesHId: { type: Number, default: 1 },
    highVolumeNodes: [volumeNodeSchema],
    highVolumeNodesId: { type: Number, default: 1 },
    lowVolumeNodes: [volumeNodeSchema],
    lowVolumeNodesId: { type: Number, default: 1 },
    enterExitLines: { type: enterExitLineSchema, default: {} },

  },
  status: { type: Number, default: 0 },
  dateAdded: { type: Date, default: new Date() },
  chartedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("ChartableStock", chartableStockSchema);
