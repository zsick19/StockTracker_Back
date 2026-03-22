const express = require("express");
const router = express.Router();
const ChartingController = require("../controllers/ChartingController");
const { get } = require("mongoose");

router.route("/:chartId")
    .get(ChartingController.fetchChartingAndKeyLevelData)
    .put(ChartingController.updateUserChartingPerChartId)
    .delete(ChartingController.removeChartableStock)

router.route('/macro/:macroChartId')
    .get(ChartingController.fetchMacroChartingAndKeyLevelData)
    .post(ChartingController.updateMacroChartPerChartId)


// router.route("/keyLevels/macros")
//     .get(ChartingController.fetchUsersMacroKeyLevelsDate)

router.route("/keyLevels/singleMacro/:chartId")
    .get(ChartingController.fetchKeyLevelsData)
    .put(ChartingController.updateKeyLevelData)

router.route("/keyLevels/dailyZones")
    .post(ChartingController.updateDailyZones)

router.route('/keyLevels/dailyMacroExpectedMoves')
    .post(ChartingController.updateDailyExpectedMoves)
router.route('/keyLevels/weeklyMacroExpectedMoves')
    .post(ChartingController.updateWeeklyExpectedMoves)
router.route('/keyLevels/monthlyMacroExpectedMoves')
    .post(ChartingController.updateMonthlyExpectedMoves)
router.route('/keyLevels/quarterlyMacroExpectedMoves')
    .post(ChartingController.updateQuarterlyExpectedMoves)

module.exports = router;
