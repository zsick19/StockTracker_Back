const express = require("express");
const router = express.Router();
const AlertController = require('../controllers/AlertController')


router.route('/:ticker/:chartId')
    .get(AlertController.markAlertSeenForTickerWatch)
    .post(AlertController.createAlertForTicker)
    .put(AlertController.updateAlertForTickerWatch)
    .delete(AlertController.removeAlertForTickerWatch)


module.exports = router;
