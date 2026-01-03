const ChartableStock = require("../models/ChartableStock");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const WatchList = require("../models/WatchList");


const createUserWatchList = asyncHandler(async (req, res) =>
{
    const { userId } = req.params;
    const macro = req.query.macro;
    const { title } = req.body;

    if (!userId || !title) return res.statusCode(404);

    const foundUser = await User.findById(userId);
    if (!foundUser) return res.status(401).json({ message: "Unauthorized" });

    const createdWatchList = await WatchList.create({ title: title, tickersContained: [], user: foundUser._id, });

    if (macro) { foundUser.macroWatchLists.push(createdWatchList); }

    await foundUser.save();

    res.json(createdWatchList);
});

const renameUserWatchList = asyncHandler(async (req, res) =>
{
    const { watchListId } = req.params
    const titleToUpdate = req.query.updatedTitle

    const foundWatchList = await WatchList.findById(watchListId)

    if (foundWatchList.useCase === 'defaultMacro') return res.status(405).json({ error: 'Can not override default watchlist' })

    foundWatchList.title = titleToUpdate
    await foundWatchList.save()
    res.json({ updatedTitle: foundWatchList.title })
})

const deleteUserWatchList = asyncHandler(async (req, res) =>
{
    const { watchListId } = req.params
    const foundWatchList = await WatchList.findById(watchListId)
    if (foundWatchList.useCase === 'defaultMacro')
    {
        res.status(405).json({ error: 'Default Macro watch lists can not be deleted' })
    } else
    {
        await foundWatchList.deleteOne();

        res.json({ deletedWatchlist: foundWatchList._id })
    }
})

const addTickerToWatchList = asyncHandler(async (req, res) =>
{
    const userIdFromToken = "6952bd331482f8927092ddcc";
    const tickerToAdd = req.query.ticker.toUpperCase();
    const { watchListId } = req.params;

    const foundWatchList = await WatchList.findById(watchListId);
    if (!foundWatchList) return res.status(404);


    let tickerAlreadyInWatchlist = false;
    foundWatchList.tickersContained.map((ticker) => { if (ticker.ticker === tickerToAdd) { tickerAlreadyInWatchlist = true; return; } });
    if (tickerAlreadyInWatchlist) return;

    const foundChartableTicker = await ChartableStock.findOne({ tickerSymbol: tickerToAdd, chartedBy: userIdFromToken });

    if (foundChartableTicker)
    {
        foundWatchList.tickersContained.push({ _id: foundChartableTicker._id, ticker: foundChartableTicker.tickerSymbol, });
        await foundWatchList.save();

        res.json({ ticker: foundChartableTicker.tickerSymbol, _id: foundChartableTicker._id, });
    } else
    {
        const createdChartableTicker = await ChartableStock.create({ tickerSymbol: tickerToAdd, chartedBy: userIdFromToken, });
        foundWatchList.tickersContained.push({ _id: createdChartableTicker._id, ticker: createdChartableTicker.tickerSymbol, });
        await foundWatchList.save();

        res.json({ ticker: createdChartableTicker.tickerSymbol, _id: createdChartableTicker._id, });
    }
});

const removeTickerFromWatchList = asyncHandler(async (req, res) =>
{
    const tickerToRemove = req.query.ticker.toUpperCase();
    const { watchListId } = req.params;
    if (!tickerToRemove) return res.status(400)


    const foundWatchList = await WatchList.findById(watchListId);
    if (!foundWatchList) return res.status(404);

    let successfulRemoval = true
    foundWatchList.tickersContained = foundWatchList.tickersContained.filter((t) =>
    {
        if (t.keep && t.ticker === tickerToRemove)
        {
            successfulRemoval = false
            return t
        }
        else return t.ticker !== tickerToRemove
    });
    await foundWatchList.save();

    if (successfulRemoval)
    {
        res.json({ tickerRemoved: tickerToRemove })
    }
    else { res.status(403).json({ message: 'can not delete default ' }) }
});

module.exports = {
    createUserWatchList,
    renameUserWatchList,
    deleteUserWatchList,
    addTickerToWatchList,
    removeTickerFromWatchList,

};
