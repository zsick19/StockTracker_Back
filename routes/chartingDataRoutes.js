const express = require("express");
const router = express.Router();
const ChartingController = require("../controllers/ChartingController");
const { get } = require("mongoose");

router.route("/:chartId")
    .get(ChartingController.fetchChartingData);

router.route("/keyLevels/macros")
    .get(ChartingController.fetchUsersMacroKeyLevelsDate)

router.route("/keyLevels/single/:chartId")
    .get(ChartingController.fetchKeyLevelsData)
    .put(ChartingController.updateKeyLevelData)

module.exports = router;
