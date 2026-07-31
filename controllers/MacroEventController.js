const asyncHandler = require("express-async-handler");
const Stock = require("../models/Stock");
const { CSV_HEADER_TRANSLATION_DICT } = require("../Utility/dbHelper");
const fs = require('fs')
const csv = require('csv-parser')
const pdf = require('pdf-parse');
const User = require("../models/User");
const MacroChartedStock = require("../models/MacroChartedStock");
const { getDay } = require("date-fns/getDay");
const { nextMonday } = require("date-fns/nextMonday");
const { isMonday } = require("date-fns/isMonday");

const fetchMacroCalendarEventsByDate = asyncHandler(async (req, res) =>
{
    const { start } = req.query
    console.log(req.query)

    res.json({ start: start })
})

const createMacroCalendarEvent = asyncHandler(async (req, res) =>
{
    const { category, text } = req.body
    try
    {
        const parseText = parseEconomicCalendar(text).map(t => parseScrapedMacroPayload(t, category))

        // console.log(parseText)

        res.json(parseText)
    } catch (error)
    {
        console.log(error)
        res.status(500).json({ m: 'failed to parse text' })
    }


})

module.exports = {
    fetchMacroCalendarEventsByDate,
    createMacroCalendarEvent
}

function parseEconomicCalendar(text)
{
    const results = [];

    // Basic structural regex matches
    const dateRegex = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+[A-Z][a-z]+\s+\d{1,2}\s+\d{4}/i;
    const timeRegex = /^\d{2}:\d{2}\s+(?:AM|PM)$/i;
    const countryTitleRegex = /^([A-Z]{2})\s+(.*)$/;

    // Split entire stream into a flat array of tab/newline elements
    const elements = text.split(/[\t\n]+/);

    let currentDate = '';
    let currentEvent = null;
    let valueCounter = 0; // Tracks fields (actual, previous, consensus, forecast)

    for (let i = 0; i < elements.length; i++)
    {
        const item = elements[i].trim();

        // 1. Check for a Date Header change
        if (dateRegex.test(item))
        {
            if (currentEvent)
            {
                finalizeEvent(currentEvent, valueCounter, results);
                currentEvent = null;
            }
            currentDate = item;
            continue;
        }

        // Skip layout tracking row names
        if (/^(Actual|Previous|Consensus|Forecast)$/i.test(item) || !item)
        {
            // If there's an active event, empty fields still count as tab/column progress
            if (elements[i] === '' && currentEvent && valueCounter < 4)
            {
                // Look ahead to check if the next elements are double tabs (skipped values)
                if (elements[i + 1] === '')
                {
                    valueCounter++;
                    i++; // Skip the paired empty tab column spacer
                }
            }
            continue;
        }

        // 2. Check if a new Event row is starting via timestamp
        if (timeRegex.test(item))
        {
            if (currentEvent)
            {
                finalizeEvent(currentEvent, valueCounter, results);
            }
            currentEvent = {
                date: currentDate,
                time: item,
                country: '',
                title: '',
                actual: null,
                previous: null,
                consensus: null,
                forecast: null
            };
            valueCounter = 0;
            continue;
        }

        // 3. Check for a Country Code + Title signature
        const countryMatch = item.match(countryTitleRegex);
        if (countryMatch)
        {
            // If we hit a country marker and we already have an active event, 
            // or if we already filled our 4 fields, finalize the old one first.
            if (currentEvent && (currentEvent.country || valueCounter >= 4))
            {
                finalizeEvent(currentEvent, valueCounter, results);
                currentEvent = null;
            }

            // If no event container was opened by a time signature, open a blank time event here
            if (!currentEvent)
            {
                currentEvent = {
                    date: currentDate,
                    time: null,
                    country: '',
                    title: '',
                    actual: null,
                    previous: null,
                    consensus: null,
                    forecast: null
                };
                valueCounter = 0;
            }

            currentEvent.country = countryMatch[1];
            currentEvent.title = countryMatch[2];
            continue;
        }

        // 4. Fill values sequentially into the 4 columns
        if (currentEvent && currentEvent.title && valueCounter < 4)
        {
            assignValue(currentEvent, valueCounter, item);
            valueCounter++;

            // If we just filled the 4th property slot, close out the object immediately
            if (valueCounter === 4)
            {
                finalizeEvent(currentEvent, valueCounter, results);
                currentEvent = null;
            }
        }
    }

    // Handle cleanup for any trailing open event structures at the end of text streams
    if (currentEvent)
    {
        finalizeEvent(currentEvent, valueCounter, results);
    }

    return results;
}

// Map index count cleanly to specific object properties
function assignValue(event, index, val)
{
    const keys = ['actual', 'previous', 'consensus', 'forecast'];
    event[keys[index]] = val;
}

// Push complete structured entities into the final results table array
function finalizeEvent(event, filledCount, resultsArray)
{
    // Ensure the object has been populated with data fields before saving
    if (event.country || event.title)
    {
        resultsArray.push(event);
    }
}


/**
 * PRODUCTION COMPILER: parseScrapedMacroPayload
 * Parses raw text payloads from trading economic calendar tables, turns fractional
 * votes or decimals into standardized numeric scalars, and outputs schema objects [INDEX].
 * 
 * @param {Object} rawScrapedNode - Single un-formatted object from your payload array
 * @param {string} selectedCategoryString - The active category wrapper (e.g., 'CENTRAL_BANKING')
 * @returns {Object|null} Pristine document payload ready for a Mongoose upsert lock
 */
function parseScrapedMacroPayload(rawScrapedNode, selectedCategoryString = 'CENTRAL_BANKING')
{
    const { date, time, country, title, actual, previous, consensus, forecast } = rawScrapedNode;

    if (!date || !title || !country) return null;

    // Convert date string ("Thursday July 30 2026") safely to a uniform YYYY-MM-DD format
    const parsedDateInstance = new Date(date);
    if (isNaN(parsedDateInstance.getTime())) return null;

    const dateKeyStr = parsedDateInstance.toISOString().split('T')[0]; // Output: "2026-07-30"
    const eventUniqueKey = `${country}_${title.toUpperCase().replace(/ /g, '_')}_${dateKeyStr}`;

    // Helper block to convert fraction strings (like "3/9" or "2/9") into raw float numbers
    const convertStringToNumericValue = (valueString) =>
    {
        if (!valueString || valueString === 'null') return 0;

        // If the exchange data prints a fractional matrix (e.g., Bank of England voting blocks) [INDEX]
        if (valueString.includes('/'))
        {
            const splitSegments = valueString.split('/');
            const numerator = parseFloat(splitSegments[0]);
            const denominator = parseFloat(splitSegments[1]) || 9;
            return numerator; // Isolate the raw hawkish/dovish member count as our baseline number [INDEX]
        }

        // Strip out any percentage or currency text indicators to isolate raw integers
        return parseFloat(valueString.replace(/[%,$]/g, '')) || 0;
    };

    const actualScalar = convertStringToNumericValue(actual);
    const forecastScalar = convertStringToNumericValue(forecast);
    const consensusScalar = convertStringToNumericValue(consensus);

    // 📐 THE CONVEXITY DEVIATION DELTA MATRIX [INDEX]
    // Solve for the exact macro surprise value: Actual printed metric minus consensus forecast!
    const surpriseDeviationDelta = actualScalar - forecastScalar;

    // Determine the importance tier rating on the fly based on country and category rules [INDEX]
    let calculatedImportance = 'LOW';
    const normalizedTitle = title.toUpperCase();

    // 1. Establish the High-Velocity Systemic Token Arrays
    const criticalBankingTokens = ['RATE', 'MEETING MINUTES', 'VOTE CUT', 'VOTE HIKE', 'FED', 'FOMC', 'BOE'];
    const criticalInflationTokens = ['INFLATION', 'CORE INFLATION', 'PCE PRICE INDEX', 'PPI', 'CPI'];
    const criticalLabourTokens = ['NON FARM PAYROLLS', 'PAYROLLS', 'UNEMPLOYMENT RATE', 'UNEMPLOYMENT', 'JOLTS'];
    const criticalGdpTokens = ['GDP GROWTH RATE', 'GDP'];
    const criticalTradeTokens = ['BALANCE OF TRADE', 'EXPORTS', 'IMPORTS'];
    const criticalBusinessTokens = ['PMI', 'TANKAN', 'INDUSTRIAL PRODUCTION', 'BUSINESS CONFIDENCE', 'ECONOMIC SENTIMENT', 'BUSINESS CLIMATE', 'DURABLE GOODS'];
    const criticalHousingTokens = ['EXISTING HOME SALES', 'BUILDING PERMITS', 'HOUSING STARTS'];
    const criticalConsumerTokens = ['RETAIL SALES', 'CONSUMER CONFIDENCE', 'CONSUMER SENTIMENT', 'PERSONAL INCOME', 'PERSONAL SPENDING'];


    // Cross-verify if the incoming event text matches our high-alpha target anchors
    const isCentralBankingEventActive = criticalBankingTokens.some(token => normalizedTitle.includes(token));
    const isInflationCatalystActive = criticalInflationTokens.some(token => normalizedTitle.includes(token));
    const isLabourCatalystActive = criticalLabourTokens.some(token => normalizedTitle.includes(token));
    const isGdpCatalystActive = criticalGdpTokens.some(token => normalizedTitle.includes(token));
    const isTradeCatalystActive = criticalTradeTokens.some(token => normalizedTitle.includes(token));
    const isBusinessCatalystActive = criticalBusinessTokens.some(token => normalizedTitle.includes(token));
    const isHousingCatalystActive = criticalHousingTokens.some(token => normalizedTitle.includes(token));
    const isConsumerCatalystActive = criticalConsumerTokens.some(token => normalizedTitle.includes(token));


    if (country === 'US' || country === 'GB' || country === 'EU')
    {
        if (selectedCategoryString === 'INTEREST_RATE' || isCentralBankingEventActive)
        {
            // TIER A: Direct interest rate decisions and voting policy splits [INDEX]
            calculatedImportance = 'CRITICAL';
        }
        else if (selectedCategoryString === 'PRICES_INFLATION' || isInflationCatalystActive)
        {
            // TIER B: High-velocity inflation data releases (e.g., Core PCE Price Index MoM) [INDEX]
            calculatedImportance = 'CRITICAL';
        }
        else if (selectedCategoryString === 'LABOUR_MARKET' || isLabourCatalystActive)
        {
            // TIER C: Systemic employment triggers that alter macro liquidity vectors
            if (normalizedTitle.includes('NON FARM PAYROLLS') || normalizedTitle.includes('NON-FARM'))
            {
                calculatedImportance = 'CRITICAL';
            } else
            {
                calculatedImportance = 'HIGH';
            }
        }
        else if (selectedCategoryString === 'GDP_GROWTH' || isGdpCatalystActive)
        {
            // TIER D: Systemic Growth/Recession Triggers
            if (normalizedTitle.includes('ADV ') || normalizedTitle.includes('ADVANCE'))
            {
                calculatedImportance = 'CRITICAL';
            } else
            {
                calculatedImportance = 'HIGH';
            }
        }
        else if (selectedCategoryString === 'CONSUMER_SENTIMENT' || isConsumerCatalystActive || selectedCategoryString === 'CONSUMER')
        {
            // TIER E: High-Velocity Consumer Spending & Demand Sentiment [INDEX]
            if (country === 'US' && normalizedTitle.includes('RETAIL SALES'))
            {
                calculatedImportance = 'CRITICAL'; // Primary economic consumer engine [INDEX]
            } else if (normalizedTitle.includes('MICHIGAN') && normalizedTitle.includes('PREL'))
            {
                calculatedImportance = 'HIGH'; // High surprise value early sentiment flash [INDEX]
            } else if (normalizedTitle.includes('CONSUMER CONFIDENCE') || normalizedTitle.includes('PERSONAL SPENDING'))
            {
                calculatedImportance = 'HIGH'; // Core consumer output indexes
            } else
            {
                calculatedImportance = 'MEDIUM'; // Personal Income or international trackers (e.g., GfK Consumer)
            }
        }
        else if (selectedCategoryString === 'BUSINESS_CONFIDENCE' || isBusinessCatalystActive)
        {
            // TIER E: High-Velocity Business Surveys, Sentiment, and Output Data [INDEX]
            if (country === 'US' && (normalizedTitle.includes('ISM MANUFACTURING') || normalizedTitle.includes('ISM SERVICES')))
            {
                calculatedImportance = 'CRITICAL'; // Apex US leading indicators [INDEX]
            } else if (normalizedTitle.includes('FLASH') && normalizedTitle.includes('PMI'))
            {
                calculatedImportance = 'CRITICAL'; // High surprise value early indicators [INDEX]
            } else if (normalizedTitle.includes('TANKAN') || normalizedTitle.includes('IFO BUSINESS CLIMATE') || normalizedTitle.includes('ZEW ECONOMIC') || normalizedTitle.includes('NBS MANUFACTURING'))
            {
                calculatedImportance = 'HIGH'; // Prime regional block indicators
            } else if (normalizedTitle.includes('DURABLE GOODS ORDERS') || normalizedTitle.includes('INDUSTRIAL PRODUCTION'))
            {
                calculatedImportance = 'HIGH'; // Hard production metrics
            } else
            {
                calculatedImportance = 'MEDIUM';
            }
        }
        else if (selectedCategoryString === 'HOUSING_MARKET' || isHousingCatalystActive)
        {
            // TIER F: Real Estate Credit & Industrial Supply Anchors [INDEX]
            // If it is the leading Building Permits flash reading, assign HIGH priority [INDEX]
            if (normalizedTitle.includes('BUILDING PERMITS') && normalizedTitle.includes('PREL'))
            {
                calculatedImportance = 'HIGH';
            } else
            {
                calculatedImportance = 'MEDIUM'; // Coincident Housing Starts or lagging Existing Sales [INDEX]
            }
        }
        else if (selectedCategoryString === 'FOREIGN_TRADE' || isTradeCatalystActive)
        {
            if (normalizedTitle.includes('BALANCE OF TRADE'))
            {
                calculatedImportance = 'HIGH';
            } else
            {
                calculatedImportance = 'MEDIUM';
            }
        }
        else
        {
            calculatedImportance = 'MEDIUM';
        }
    }

    if (country === 'BR' || country === 'CA' || country === 'AU')
    {
        if (selectedCategoryString === 'CENTRAL_BANKING' || isCentralBankingEventActive)
        {
            calculatedImportance = 'HIGH';
        } else if (isGdpCatalystActive || isLabourCatalystActive || isTradeCatalystActive || isBusinessCatalystActive || isHousingCatalystActive)
        {
            calculatedImportance = 'MEDIUM';
        }
    }

    return {
        eventUniqueKey,
        eventTitleStr: title,
        eventDateIso: parsedDateInstance,
        eventDateKeyStr: dateKeyStr,
        eventSubCategory: selectedCategoryString,
        forecastValue: forecastScalar,
        actualValue: actualScalar,
        deviationDeltaValue: parseFloat(surpriseDeviationDelta.toFixed(3)), // Guard against decimal rounding drift
        importanceTierRating: calculatedImportance,
        spyEventHourRangePct: 0, // Left blank at zero; to be hydrated live by your 5-min post-market crons [INDEX]
        vixEventHourDilationDelta: 0
    };
}

