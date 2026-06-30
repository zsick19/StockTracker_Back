const https = require('https');
const EnterExitPlannedStock = require('../../../models/EnterExitPlannedStock');
const { getDay, addDays, nextFriday, format, differenceInCalendarDays, parseISO } = require('date-fns')

/**
 * PRODUCTION COMPILER: Multi-Ticker Weekly Options Batch Downloader.
 * Consolidates your entire active watch list into a single REST call to maximize
 * network capability and bypass Alpaca API request blocks.
 * 
 * @param {Array<string>} watchlistSymbolsArray - Array of targets (e.g., ["AAPL", "AMD", "MSFT"])
 * @returns {Promise<Object>} An object mapping symbols to contracts: { AAPL: [...], AMD: [...] }
 */
function fetchBatchWeeklyOptionsContracts(watchlistSymbolsArray, snapShots)
{
    return new Promise((resolve, reject) =>
    {
        if (!watchlistSymbolsArray || watchlistSymbolsArray.length === 0) { return resolve({}); }

        // 1. Join your string array cleanly using commas for URL parameter parsing
        // Transforms ["AAPL", "AMD"] straight into the string "AAPL,AMD"
        const unifiedTickerQueryString = watchlistSymbolsArray.join(',');

        const fiveWeeksOutDateString = format(addDays(new Date(), 35), 'yyyy-MM-dd');

        const requestConfig = {
            method: 'GET',
            hostname: 'api.alpaca.markets', // Production Options Data Gateway
            port: null,
            // We pass the consolidated list directly to our underlying_symbols param key
            path: `/v2/options/contracts?underlying_symbols=${encodeURIComponent(unifiedTickerQueryString)}&status=active&limit=2500&expiration_date_lte=${fiveWeeksOutDateString}`,
            headers: {
                'accept': 'application/json',
                'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
                'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET
            }
        };

        const networkRequest = https.request(requestConfig, function (response)
        {
            const dataBufferChunks = [];

            response.on('data', function (chunk)
            {
                dataBufferChunks.push(chunk);
            });

            response.on('end', function ()
            {
                try
                {
                    const completeRawBody = Buffer.concat(dataBufferChunks).toString();
                    const parsedJsonPayload = JSON.parse(completeRawBody);

                    const rawContractsArray = parsedJsonPayload.option_contracts || [];
                    if (rawContractsArray.length === 0) return;

                    // 1. Group the massive array of contracts by their parent underlying symbol
                    const contractsGroupedByTicker = {};
                    rawContractsArray.forEach(contract =>
                    {
                        const ticker = contract.underlying_symbol;
                        if (!contractsGroupedByTicker[ticker])
                        {
                            contractsGroupedByTicker[ticker] = [];
                        }
                        contractsGroupedByTicker[ticker].push(contract);
                    });

                    const bulkMongoOperations = [];

                    // 2. RUN INDEPENDENT VERTICAL AGGREGATION PASSES PER TICKER
                    Object.keys(contractsGroupedByTicker).forEach(ticker =>
                    {
                        const allTickerContracts = contractsGroupedByTicker[ticker];

                        // SURGICAL RECON A: Extract and sort all unique upcoming expiration dates present
                        const uniqueExpirationDatesSorted = [...new Set(allTickerContracts.map(c => c.expiration_date))]
                            .sort((a, b) => new Date(a) - new Date(b));

                        // Isolate the absolute closest expiration date available for this specific stock [INDEX]
                        const absoluteNearestExpirationDate = uniqueExpirationDatesSorted[0];
                        if (!absoluteNearestExpirationDate) return;

                        // Calculate the precise calendar days remaining until this specific contract expires completely [INDEX]
                        const expirationDateObj = parseISO(absoluteNearestExpirationDate);
                        const daysRemaining = differenceInCalendarDays(expirationDateObj, today);

                        // Enforce the strict 5-day operational threshold boundary line for institutional gamma pressure [INDEX]
                        const isExpirationImminentWindow = daysRemaining <= 5;

                        // SURGICAL RECON B: Filter down to analyze ONLY contracts matching the nearest cycle
                        const frontCycleContracts = allTickerContracts.filter(c => c.expiration_date === absoluteNearestExpirationDate);

                        let maxPutOi = 0;
                        let preCompiledPutWallStrike = 0;

                        let maxCallOi = 0;
                        let preCompiledCallWallStrike = 0;


                        let totalPutOi = 0;
                        let totalCallOi = 0;
                        let atmContractIv = 0.45; // Default 45% fallback placeholder
                        const trailingClosePrice = snapShots.find(t => t.symbol === ticker).LatestTrade.Price

                        // 3. EXECUTE METRIC EXTRACTION PASS OVER THE FRONT CYCLE CONTRACTS [INDEX]
                        frontCycleContracts.forEach(contract =>
                        {
                            const strike = parseFloat(contract.strike_price);
                            const openInterest = parseInt(contract.open_interest || 0, 10);
                            const isPut = contract.type === 'put';

                            // Extract Put Wall Floor landmarks [INDEX]
                            if (isPut && openInterest > maxPutOi)
                            {
                                maxPutOi = openInterest;
                                preCompiledPutWallStrike = strike;
                            }

                            // Extract Call Wall Ceiling landmarks [INDEX]
                            if (!isPut && openInterest > maxCallOi)
                            {
                                maxCallOi = openInterest;
                                preCompiledCallWallStrike = strike;
                            }


                            // Accumulate total baseline open interest weight layers [INDEX]
                            if (isPut) { totalPutOi += openInterest; }
                            else { totalCallOi += openInterest; }
                            // Isolate the At-The-Money contract to capture the baseline Implied Volatility (IV)
                            if (Math.abs(strike - trailingClosePrice) <= 1.0 && contract.implied_volatility)
                            {
                                atmContractIv = parseFloat(contract.implied_volatility);
                            }
                        });



                        // 4. TIMEFRAME FIELD BUCKET ROUTER (PREVENTS PREMATURE OPTIONS PINNING OVERRIDES)
                        const optionsDataBlock = {
                            weekly: { putWall: 0, callWall: 0, putCallRatio: 0, lowerExpectedBounds: 0, upperExpectedBounds: 0 },
                            monthly: { putWall: 0, callWall: 0, putCallRatio: 0, lowerExpectedBounds: 0, upperExpectedBounds: 0 },
                            metadata: {
                                targetExpirationDate: absoluteNearestExpirationDate,
                                daysRemainingToExpiration: daysRemaining,
                                isExpirationImminent: isExpirationImminentWindow,
                                lastReCalibratedTimestamp: new Date()
                            }
                        };

                        const preCompiledPutCallRatio = totalCallOi > 0 ? (totalPutOi / totalCallOi) : 1.0;
                        // Calculate your strict Weekly Expected Move Boundaries using your scalar formula [INDEX]

                        const weeklyMoveDollarCushion = trailingClosePrice * atmContractIv * Math.sqrt(7 / 365);
                        const lowerBound = trailingClosePrice - weeklyMoveDollarCushion;
                        const upperBound = trailingClosePrice + weeklyMoveDollarCushion;


                        if (isExpirationImminentWindow)
                        {
                            // Contract expires this week; fill the weekly pressure chambers to unlock live pinning bonuses [INDEX]
                            optionsDataBlock.weekly.putWall = preCompiledPutWallStrike;
                            optionsDataBlock.weekly.callWall = preCompiledCallWallStrike;
                            optionsDataBlock.weekly.putCallRatio = parseFloat(preCompiledPutCallRatio.toFixed(2))
                            optionsDataBlock.weekly.lowerExpectedBounds = lowerBound;
                            optionsDataBlock.weekly.upperExpectedBounds = upperBound;

                        } else
                        {
                            // Contract sits weeks out; route it to the monthly bucket, shielding the weekly tracks [INDEX]
                            optionsDataBlock.monthly.putWall = preCompiledPutWallStrike;
                            optionsDataBlock.monthly.callWall = preCompiledCallWallStrike;
                            optionsDataBlock.monthly.putCallRatio = parseFloat(preCompiledPutCallRatio.toFixed(2))
                            optionsDataBlock.monthly.lowerExpectedBounds = lowerBound;
                            optionsDataBlock.monthly.upperExpectedBounds = upperBound;
                        }

                        if (preCompiledPutWallStrike > 0 || preCompiledCallWallStrike > 0)
                        {
                            console.log(optionsDataBlock)
                            bulkMongoOperations.push({
                                updateOne: {
                                    filter: { tickerSymbol: ticker },
                                    update: {
                                        $set: { "optionsExpectedMoves": optionsDataBlock }

                                    }
                                }
                            });
                        }
                    });

                    // 4. EXECUTE ATOMIC WRITE PASS
                    if (bulkMongoOperations.length > 0) bulkWriteOptionsData(bulkMongoOperations)
                    resolve()

                }
                catch (parseError)
                {
                    reject(new Error(`JSON Ingestion Parse Breakdown: ${parseError.message}`));
                }
                console.log(`✨ Batch Options Ingestion Complete: Successfully mapped contracts across ${watchlistSymbolsArray.length} tickers.`);
            });
        });

        networkRequest.on('error', function (requestError)
        {
            reject(requestError);
        });

        networkRequest.end();
    });
}

async function bulkWriteOptionsData(bulkMongoOperations)
{
    try
    {
        // console.log("Full Bulk Payload:", JSON.stringify(bulkMongoOperations, null, 2));
        const bulkResult = await EnterExitPlannedStock.bulkWrite(bulkMongoOperations);
        console.log(`✨ Single-Pass Options Sync Complete: Hydrated ${bulkResult.modifiedCount} documents with institutional walls.`);
    } catch (e)
    {
        console.log(e)
    }
}

// /**
//  * Enterprise-Grade Consolidated Options Aggregator.
//  * Processes the entire weekly options matrix in a single REST trip by utilizing
//  * the open_interest data embedded straight inside the contract objects [INDEX].
//  * 
//  * @param {Object} parsedJsonPayload - The raw JSON body back from your batch contracts call
//  */
// async function processAndSaveOptionsLandmarks(parsedJsonPayload)
// {
//     const rawContractsArray = parsedJsonPayload.option_contracts || [];
//     if (rawContractsArray.length === 0) return;

//     // 1. Group the massive array of contracts by their parent underlying symbol
//     const contractsGroupedByTicker = {};
//     rawContractsArray.forEach(contract =>
//     {
//         const ticker = contract.underlying_symbol;
//         if (!contractsGroupedByTicker[ticker])
//         {
//             contractsGroupedByTicker[ticker] = [];
//         }
//         contractsGroupedByTicker[ticker].push(contract);
//     });

//     const bulkMongoOperations = [];

//     // // 2. RUN INDEPENDENT VERTICAL AGGREGATION PASSES PER TICKER
//     // Object.keys(contractsGroupedByTicker).forEach(ticker =>
//     // {
//     //     const tickerContracts = contractsGroupedByTicker[ticker];

//     //     let maxPutOi = 0;
//     //     let preCompiledPutWall = 0;

//     //     let maxCallOi = 0;
//     //     let preCompiledCallWall = 0;
//     //     let totalPutOi = 0;
//     //     let totalCallOi = 0;
//     //     let atmContractIv = 0.45; // Default 45% fallback placeholder
//     //     const trailingClosePrice = plan.liveAuctionMetrics?.lastTradePrice || 277;




//     //     // Loop over the contracts to locate your dominant institutional walls [INDEX]
//     //     tickerContracts.forEach(contract =>
//     //     {
//     //         const strike = parseFloat(contract.strike_price);
//     //         const openInterest = parseInt(contract.open_interest || 0, 10);
//     //         const isPut = contract.type === 'put';

//     //         // Accumulate total baseline open interest weight layers [INDEX]
//     //         if (isPut)
//     //         {
//     //             totalPutOi += openInterest;
//     //         } else
//     //         {
//     //             totalCallOi += openInterest;
//     //         }


//     //         // Isolate the At-The-Money contract to capture the baseline Implied Volatility (IV)
//     //         if (Math.abs(strike - trailingClosePrice) <= 1.0 && contract.implied_volatility)
//     //         {
//     //             atmContractIv = parseFloat(contract.implied_volatility);
//     //         }
//     //     });
//     //     // Calculate your strict Weekly Expected Move Boundaries using your scalar formula [INDEX]
//     //     const weeklyMoveDollarCushion = trailingClosePrice * atmContractIv * Math.sqrt(7 / 365);
//     //     const lowerWeeklyBound = trailingClosePrice - weeklyMoveDollarCushion;
//     //     const upperWeeklyBound = trailingClosePrice + weeklyMoveDollarCushion;

//     //     const preCompiledPutCallRatio = totalCallOi > 0 ? (totalPutOi / totalCallOi) : 1.0;



//     //     console.log(preCompiledCallWall, preCompiledPutWall)
//     //     // 3. PUSH INTENT TO ATOMIC BULK BUFFER
//     //     //     if (preCompiledPutWall > 0 || preCompiledCallWall > 0)
//     //     //     {
//     //     //         bulkMongoOperations.push({
//     //     //             updateOne: {
//     //     //                 filter: { tickerSymbol: ticker },
//     //     //                 update: {
//     //     //                     $set: {
//     //     // "optionsExpectedMoves.weekly.putWall": preCompiledPutWall,
//     //     // "optionsExpectedMoves.weekly.callWall": preCompiledCallWall,
//     //     // "optionsExpectedMoves.weekly.putCallRatio": parseFloat(preCompiledPutCallRatio.toFixed(2)),
//     //     // "optionsExpectedMoves.weekly.upperExpectedMoveBound": parseFloat(upperWeeklyBound.toFixed(2)),
//     //     // "optionsExpectedMoves.weekly.lowerExpectedMoveBound": parseFloat(lowerWeeklyBound.toFixed(2)),
//     //     // "optionsExpectedMoves.weekly.lastReCalibratedTimestamp": new Date()
//     //     //                 }
//     //     //             }
//     //     //         });
//     //     //     }
//     //     // });

//     //     // // 4. EXECUTE ATOMIC WRITE PASS
//     //     // if (bulkMongoOperations.length > 0)
//     //     // {
//     //     //     const bulkResult = await TradingPlanModel.bulkWrite(bulkMongoOperations);
//     //     //     console.log(`✨ Single-Pass Options Sync Complete: Hydrated ${bulkResult.modifiedCount} documents with institutional walls.`);
//     //     // }
//     // })
// }




module.exports = { fetchBatchWeeklyOptionsContracts }