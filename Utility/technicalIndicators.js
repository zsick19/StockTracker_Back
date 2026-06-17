


/**
 * Dynamically parses the Alpaca option symbol from right to left using RegEx.
 */
function parseAlpacaSymbol(symbol)
{
    if (!symbol) return null;
    const match = symbol.match(/(\d{6})([CP])(\d{8})$/);
    if (!match) return null;

    return {
        expiration: match[1],
        type: match[2] === 'C' ? 'CALL' : 'PUT',
        strike: parseFloat(match[3]) / 1000
    };
}

/**
 * Finds the nearest expiration date present in the array.
 */
function getNearestValidExpiration(chainArray)
{
    const validDates = chainArray
        .map(item =>
        {
            if (!item || !item.Symbol || !item.Greeks || typeof item.Greeks.gamma !== 'number' || isNaN(item.Greeks.gamma))
            {
                return null;
            }
            const parsed = parseAlpacaSymbol(item.Symbol);
            return parsed ? parsed.expiration : null;
        })
        .filter(Boolean);

    if (validDates.length === 0) return null;
    return [...new Set(validDates)].sort((a, b) => parseInt(a) - parseInt(b))[0];
}

/**
 * Calculates Primary and Secondary Call/Put Walls based on Gamma Concentrations [1, 2]
 */
function calculateMorningWalls(chainArray)
{
    if (!Array.isArray(chainArray) || chainArray.length === 0)
    {
        console.error("❌ Error: Input array is empty or invalid.");
        return null;
    }

    const targetExp = getNearestValidExpiration(chainArray);
    if (!targetExp)
    {
        console.error("❌ Error: No valid options data with computed Greeks found.");
        return null;
    }

    // Tracking structure for CALLS
    let maxCallGamma = -1;
    let callWallPrice = null;
    let secondMaxCallGamma = -1;
    let secondCallWallPrice = null;

    // Tracking structure for PUTS
    let maxPutGamma = -1;
    let putWallPrice = null;
    let secondMaxPutGamma = -1;
    let secondPutWallPrice = null;

    chainArray.forEach((contract) =>
    {
        if (!contract || !contract.Symbol) return;

        const parsed = parseAlpacaSymbol(contract.Symbol);
        if (!parsed || parsed.expiration !== targetExp) return;

        if (!contract.Greeks || typeof contract.Greeks.gamma !== 'number' || isNaN(contract.Greeks.gamma))
        {
            return;
        }

        const gamma = Math.abs(contract.Greeks.gamma);
        const strike = parsed.strike;

        // --- EVALUATE CALLS ---
        if (parsed.type === 'CALL')
        {
            if (gamma > maxCallGamma)
            {
                // Shift current primary down to secondary ONLY if it doesn't create an invalid duplicate
                if (callWallPrice !== putWallPrice)
                {
                    secondMaxCallGamma = maxCallGamma;
                    secondCallWallPrice = callWallPrice;
                }
                maxCallGamma = gamma;
                callWallPrice = strike;
            } else if (gamma > secondMaxCallGamma && strike !== callWallPrice && strike !== putWallPrice)
            {
                // CRITICAL FIX: Secondary Call strike cannot be the same as the Call Wall OR the Put Wall
                secondMaxCallGamma = gamma;
                secondCallWallPrice = strike;
            }
        }
        // --- EVALUATE PUTS ---
        else if (parsed.type === 'PUT')
        {
            if (gamma > maxPutGamma)
            {
                if (putWallPrice !== callWallPrice)
                {
                    secondMaxPutGamma = maxPutGamma;
                    secondPutWallPrice = putWallPrice;
                }
                maxPutGamma = gamma;
                putWallPrice = strike;
            } else if (gamma > secondMaxPutGamma && strike !== putWallPrice && strike !== callWallPrice)
            {
                // CRITICAL FIX: Secondary Put strike cannot be the same as the Put Wall OR the Call Wall
                secondMaxPutGamma = gamma;
                secondPutWallPrice = strike;
            }
        }
    });


    return {
        dateId: targetExp,
        walls: {
            primary: {
                callWall: callWallPrice,
                putWall: putWallPrice
            },
            secondary: {
                callWall: secondCallWallPrice,
                putWall: secondPutWallPrice
            }
        }
    };
}



module.exports = { calculateMorningWalls }