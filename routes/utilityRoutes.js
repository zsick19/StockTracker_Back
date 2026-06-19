const express = require("express");
const router = express.Router();

const UtilityController = require('../controllers/UtilityController');
const multer = require("multer");
const upload = multer({ dest: '/tmp/' });
const uploadTextFile = multer({ storage: multer.memoryStorage() });

router.route("/dailyStockCSVUpload")
    .post(upload.single('csvFile'), UtilityController.uploadStockCSVFile)

router.route('/expectedMovesCoreUpload')
    .post(uploadTextFile.single('expectedMovesCoreFile'), UtilityController.uploadExpectedMovesCoreFile)

router.route('/zoneDocUpload')
    .post(uploadTextFile.single('zonePDF'),UtilityController.uploadZoneFile)

module.exports = router;
