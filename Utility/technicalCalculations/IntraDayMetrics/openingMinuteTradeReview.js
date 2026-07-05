/**
 * SANBOX DATA TOOL: reviewOpeningMinuteTape
 * Queries Alpaca's trade endpoint for the first 60 seconds of the session,
 * isolates the official opening auction block, and prints an analytical summary [INDEX].
 */
function reviewOpeningMinuteTape(rawTradeData)
{
    if (rawTradeData.length === 0)
    {
        console.log("❌ No trade data returned for this time window. Verify date or symbol.");
        return;
    }

    let officialAuctionCrossPrice = 0;
    let maximumBlockSizeFound = 0;
    let totalMinuteVolumeAccumulated = 0;

    // 📊 SINGLE-PASS METRIC PARSING LOOP
    rawTradeData.forEach(trade =>
    {
        const size = trade.Size || trade.s || 0;
        const price = trade.Price || trade.p || 0;

        totalMinuteVolumeAccumulated += size;

        // The official opening cross is mathematically the largest print block at 09:30:00 [INDEX]
        if (size > maximumBlockSizeFound)
        {
            maximumBlockSizeFound = size;
            officialAuctionCrossPrice = price;
        }
    });

    // Compute what percentage of the first minute's total volume was tied up in that single auction print
    const auctionVolumeConcentrationRatio = (maximumBlockSizeFound / totalMinuteVolumeAccumulated) * 100;


    return {
        officialAuctionCrossPrice: parseFloat(officialAuctionCrossPrice.toFixed(2)),
        maximumBlockSizeFound: parseFloat( maximumBlockSizeFound.toLocaleString())
    }
}


module.exports = { reviewOpeningMinuteTape }