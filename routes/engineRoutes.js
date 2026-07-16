const express = require("express");
const router = express.Router();
const EngineController = require("../controllers/EngineController");
const DeepDiscountController = require('../controllers/DeepDiscountEngineController')

router.route("/historical")
    .get(EngineController.fetchHistoricalEngineData);

router.route("/today/bars/openingSession")
    .get(EngineController.fetchTodaysOpenEngineData);

router.route("/today/bars/regularSession")
    .get(EngineController.fetchTodaysRegularEngineData);

router.route("/today/bars/regularSession/minute")
    .get(EngineController.fetchTodaysRegularOneMinEngineData)

router.route("/today/trades")
    .get(EngineController.fetchTradeEngineData);

router.route('/today/openCross')
    .get(EngineController.fetchOpeningCrossData)




router.route("/deepDiscount")
    .post(DeepDiscountController.fetchHistoricalEngineData);


module.exports = router;
