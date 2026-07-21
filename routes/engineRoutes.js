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


router.route('/today/morning')
    .get(EngineController.fetchMorningData)
router.route('/today/openCross')
    .get(EngineController.fetchOpeningCrossData)
router.route('/today/midDay')
    .get(EngineController.fetchMiddayData)
router.route('/today/postClose')
    .get(EngineController.fetchPostCloseData)




router.route("/deepDiscount")
    .post(DeepDiscountController.initiateLiveQuoteAndFetchDailyData);

router.route('/deedDiscount/trades')
    .get(DeepDiscountController.fetchPastMinsOfTrades)

router.route("/deedDiscount/remove")
    .post(DeepDiscountController.clearLiveQuoteDeepDiscount)

router.route("/deepDiscount/planAlerts")
    .post(DeepDiscountController.createOrUpdateDeepDiscountAlertToPlan)
    .delete(DeepDiscountController.removeDeepDiscountAlertFromPlan)

router.route("/deepDiscount/planAlerts/reviewed")
    .get(DeepDiscountController.markPlanFullyDeepDiscountReviewed)

router.route("/exitAlert")
    .post(DeepDiscountController.createOrUpdateExitAlertToPlan)
    .delete(DeepDiscountController.removeExitAlertFromPlan)


module.exports = router;
