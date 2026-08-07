const express = require("express");
const router = express.Router();
const JournalController = require('../controllers/JournalController')

router.route('/')
    .post(JournalController.createJournalEntry)

router.route('/:journalId')
    .delete(JournalController.removeJournalEntry)

module.exports = router;
