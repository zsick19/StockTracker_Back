const express = require("express");
const router = express.Router();
const MacroEventController = require('../controllers/MacroEventController')




router.route('/')
    .get(MacroEventController.fetchMacroCalendarEventsByDate)
    .post(MacroEventController.createMacroCalendarEvent)





module.exports = router;
