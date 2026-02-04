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

// router.route("/keyLevels/macros")
//     .get(ChartingController.fetchUsersMacroKeyLevelsDate)

router.route("/keyLevels/singleMacro/:chartId")
    .get(ChartingController.fetchKeyLevelsData)
    .put(ChartingController.updateKeyLevelData)

module.exports = router;
