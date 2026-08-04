const express = require("express");
const router = express.Router();
const JournalController = require('../controllers/JournalController')

router.route('/')
    .post(JournalController.createJournalEntry)


module.exports = router;
