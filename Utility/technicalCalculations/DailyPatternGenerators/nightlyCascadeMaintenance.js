/**
 * Nightly Cascade Pattern Recalculation Engine.
 * Automatically checks for trend extensions or active reversal triggers
 * to seamlessly update database plan configurations.
 */
function processNightlyCascadeMaintenance(existingPlanDoc, todaysDailyCandle, enterBufferPercent = 0.03)
{
    const todayHigh = todaysDailyCandle.HighPrice;
    const todayClose = todaysDailyCandle.ClosePrice;
    const todayDateStr = todaysDailyCandle.Timestamp.split('T')[0];

    // Pull your current saved peak anchor variables from the database document
    let currentSavedPeakPrice = existingPlanDoc.projection.anchorPeak;
    let currentRelevantDate = existingPlanDoc.points.at(-1).date;

    // Calculate the Enter Buffer Zone line where a reversal is confirmed
    const enterBufferLine = currentSavedPeakPrice * (1 - enterBufferPercent);

    let systemStatus = "HOLD_STATE";
    // 1. CONDITION A: Today printed a higher high -> Trend is extending
    if (todayHigh > currentSavedPeakPrice && todayClose > enterBufferLine)
    {
        currentSavedPeakPrice = todayHigh;
        currentRelevantDate = todayDateStr;
        systemStatus = "OVERWRITE_PEAK_ANCHOR";
    }
    // 2. CONDITION B: Price broke below the buffer line -> Reversal is actively live
    else if (todayClose <= enterBufferLine)
    {
        systemStatus = "FREEZE_ANCHOR_ACTIVATE_RADAR";
    }

    return {
        systemStatus,
        updatedFields: {
            anchorPeak: { date: new Date(currentRelevantDate), price: currentSavedPeakPrice },
            priceIdeal: parseFloat(enterBufferLine.toFixed(2)),
        }
    };
}


module.exports = { processNightlyCascadeMaintenance }