/**
 * Nightly Database Pivot Maintenance Job.
 * Evaluates today's daily candle against the trailing pivot template.
 * Automatically handles floating peak updates and transition lockouts.
 * 
 * @param {Array} existingPlanPivots - The current array stored in your DB: [{ date: "YYYY-MM-DD", price: number }]
 * @param {Object} todaysDailyCandle - Today's finalized candle: { HighPrice, LowPrice, ClosePrice, Timestamp }
 * @param {number} enterBufferPercent - Distance below peak to trigger a structural downward cascade (e.g., 0.03 for 3%)
 * @returns {Object} Database write commands and updated pipeline status
 */
function processNightlyPivotMaintenance(existingPlanPivots, todaysDailyCandle, enterBufferPercent = 0.03)
{
    if (!existingPlanPivots || existingPlanPivots.length === 0)
    {
        throw new Error("Critical Error: Core plan pivot array is empty.");
    }

    // Isolate today's clean calendar date string (YYYY-MM-DD)
    const todayDateString = new Date(todaysDailyCandle.Timestamp).toISOString().split('T')[0];

    // Create a copy of your pivots to modify immutably
    const updatedPivots = [...existingPlanPivots];
    const lastSavedPivot = updatedPivots[updatedPivots.length - 1];

    const todayHigh = todaysDailyCandle.HighPrice;
    const todayClose = todaysDailyCandle.ClosePrice;

    // Calculate the Enter Buffer Zone threshold based on the highest price recorded for this peak leg
    const enterBufferZonePrice = lastSavedPivot.price * (1 - enterBufferPercent);

    // --- CASE A: THE FLUSH IS LIVE (TREND REVERSAL CONFIRMED) ---
    // If today's close breaks beneath the calculated enter buffer zone boundary,
    // the downward slide is officially underway. We freeze the peak candidate permanently.
    if (todayClose <= enterBufferZonePrice)
    {
        return {
            databaseAction: "FREEZE_AND_ACTIVATE_RADAR",
            updatedPivotsArray: updatedPivots, // Array is untouched; peak is frozen at its maximum height
            statusMessage: `🔴 REVERSAL CONFIRMED: Price broke below buffer ($${enterBufferZonePrice.toFixed(2)}). Peak frozen at $${lastSavedPivot.price}. 5-Min Polling Radar Activated.`,
            enterBufferZonePrice: parseFloat(enterBufferZonePrice.toFixed(2))
        };
    }

    // --- CASE B: THE EXTENSION WAVE (PRICE DRIFTS OR CONTINUES HIGHER) ---
    // If we haven't broken the buffer, we are either printing higher highs or moving sideways.
    if (todayHigh > lastSavedPivot.price)
    {
        // Condition: Today printed a higher high than our saved candidate.
        // Action: Overwrite the price and date to push the anchor point higher.
        lastSavedPivot.price = todayHigh;
        lastSavedPivot.date = todayDateString;

        return {
            databaseAction: "OVERWRITE_PEAK_RECALCULATE",
            updatedPivotsArray: updatedPivots,
            statusMessage: `🚀 HIGHER HIGH DETECTED: Upgraded floating peak anchor to $${todayHigh} on ${todayDateString}. Target box recalculated.`,
            enterBufferZonePrice: parseFloat((todayHigh * (1 - enterBufferPercent)).toFixed(2))
        };
    }

    // --- CASE C: INSIDE SESSION DRIFT (WAITING ON DIRECTION) ---
    // Price traded lower than the peak but stayed safely above your entry buffer line.
    // The peak remains a candidate, but we do not modify its original date or maximum price point.
    return {
        databaseAction: "HOLD_STEADY_MAINTAIN_STATE",
        updatedPivotsArray: updatedPivots,
        statusMessage: `⏳ INSIDE DRIFT SESSION: Price ($${todayClose.toFixed(2)}) holding above buffer ($${enterBufferZonePrice.toFixed(2)}). Waiting for clear extension or flush.`,
        enterBufferZonePrice: parseFloat(enterBufferZonePrice.toFixed(2))
    };
}
