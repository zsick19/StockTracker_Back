const User = require("../models/User");
const EnterExitPlannedStock = require('../models/EnterExitPlannedStock');
const Alpaca = require('@alpacahq/alpaca-trade-api')
const alpaca = new Alpaca({ keyId: process.env.ALPACA_API_KEY, secretKey: process.env.ALPACA_API_SECRET });
const asyncHandler = require("express-async-handler");
const { isWeekend, previousFriday, previousThursday, subBusinessDays } = require("date-fns");

const fetchHistoricalEngineData = asyncHandler(async (req, res) =>
{
    if (!req.userId) return res.status(400).send("missing information");

    const foundUser = await User.findById(req.userId).populate('userStockHistory');
    if (!foundUser) res.status(404).json({ message: 'User not found.' })


    res.json({ m: 'connected' });
});

const fetchTodaysEngineData = asyncHandler(async (req, res) =>
{
    res.json({ m: 'connected' });

})

const fetchTradeEngineData = asyncHandler(async (req, res) =>
{
    res.json({ m: 'connected' });
})


module.exports = {
    fetchHistoricalEngineData,
    fetchTodaysEngineData,
    fetchTradeEngineData
};
