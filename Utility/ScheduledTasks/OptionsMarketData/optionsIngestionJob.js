const http = require('https');

/**
 * PRODUCTION COMPILER: Multi-Ticker Weekly Options Batch Downloader.
 * Consolidates your entire active watch list into a single REST call to maximize
 * network capability and bypass Alpaca API request blocks.
 * 
 * @param {Array<string>} watchlistSymbolsArray - Array of targets (e.g., ["AAPL", "AMD", "MSFT"])
 * @returns {Promise<Object>} An object mapping symbols to contracts: { AAPL: [...], AMD: [...] }
 */
function fetchBatchWeeklyOptionsContracts(watchlistSymbolsArray)
{
    return new Promise((resolve, reject) =>
    {
        if (!watchlistSymbolsArray || watchlistSymbolsArray.length === 0) { return resolve({}); }

        // 1. Join your string array cleanly using commas for URL parameter parsing
        // Transforms ["AAPL", "AMD"] straight into the string "AAPL,AMD"
        const unifiedTickerQueryString = watchlistSymbolsArray.join(',');

        const requestConfig = {
            method: 'GET',
            hostname: 'api.alpaca.markets', // Production Options Data Gateway
            port: null,
            // We pass the consolidated list directly to our underlying_symbols param key
            path: `/v2/options/contracts?underlying_symbols=${encodeURIComponent(unifiedTickerQueryString)}&status=active&limit=2500`,
            headers: {
                'accept': 'application/json',
                'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
                'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET
            }
        };

        const networkRequest = http.request(requestConfig, function (response)
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
                    const results = processAndSaveOptionsLandmarks(parsedJsonPayload)


                    console.log(`✨ Batch Options Ingestion Complete: Successfully mapped contracts across ${watchlistSymbolsArray.length} tickers.`);
                    resolve()

                    // const rawContractsArray = parsedJsonPayload.option_contracts || [];
                    // console.log(rawContractsArray)


                    // // 2. Initialize a clean dictionary map to separate contracts by ticker
                    // const groupedContractsMap = {};
                    // watchlistSymbolsArray.forEach(symbol => { groupedContractsMap[symbol] = []; });

                    // // 3. SINGLE PASS CLASSIFICATION LOOP
                    // // Sort out the returning array contracts into their corresponding parent buckets
                    // rawContractsArray.forEach(contract =>
                    // {
                    //     const rootTicker = contract.underlying_symbol;

                    //     if (groupedContractsMap[rootTicker])
                    //     {
                    //         // Save only the strict contract symbol key code
                    //         groupedContractsMap[rootTicker].push(contract.symbol);
                    //     }
                    // });

                    // resolve(groupedContractsMap);

                } catch (parseError)
                {
                    reject(new Error(`JSON Ingestion Parse Breakdown: ${parseError.message}`));
                }
            });
        });

        networkRequest.on('error', function (requestError)
        {
            reject(requestError);
        });

        networkRequest.end();
    });
}


/**
 * Enterprise-Grade Consolidated Options Aggregator.
 * Processes the entire weekly options matrix in a single REST trip by utilizing
 * the open_interest data embedded straight inside the contract objects [INDEX].
 * 
 * @param {Object} parsedJsonPayload - The raw JSON body back from your batch contracts call
 */
async function processAndSaveOptionsLandmarks(parsedJsonPayload)
{
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
        const tickerContracts = contractsGroupedByTicker[ticker];

        let maxPutOi = 0;
        let preCompiledPutWall = 0;

        let maxCallOi = 0;
        let preCompiledCallWall = 0;

        // Loop over the contracts to locate your dominant institutional walls [INDEX]
        tickerContracts.forEach(contract =>
        {
            const strike = parseFloat(contract.strike_price);
            const openInterest = parseInt(contract.open_interest || 0, 10);
            const isPut = contract.type === 'put';

            // Extract the Put Wall Floor [INDEX]
            if (isPut && openInterest > maxPutOi)
            {
                maxPutOi = openInterest;
                preCompiledPutWall = strike;
            }

            // Extract the Call Wall Ceiling [INDEX]
            if (!isPut && openInterest > maxCallOi)
            {
                maxCallOi = openInterest;
                preCompiledCallWall = strike;
            }
        });

        console.log(preCompiledCallWall, preCompiledPutWall)
        // 3. PUSH INTENT TO ATOMIC BULK BUFFER
        //     if (preCompiledPutWall > 0 || preCompiledCallWall > 0)
        //     {
        //         bulkMongoOperations.push({
        //             updateOne: {
        //                 filter: { tickerSymbol: ticker },
        //                 update: {
        //                     $set: {
        //                         "optionsExpectedMoves.weekly.putWall": preCompiledPutWall,
        //                         "optionsExpectedMoves.weekly.callWall": preCompiledCallWall,
        //                         "optionsExpectedMoves.weekly.lastReCalibratedTimestamp": new Date()
        //                     }
        //                 }
        //             }
        //         });
        //     }
        // });

        // // 4. EXECUTE ATOMIC WRITE PASS
        // if (bulkMongoOperations.length > 0)
        // {
        //     const bulkResult = await TradingPlanModel.bulkWrite(bulkMongoOperations);
        //     console.log(`✨ Single-Pass Options Sync Complete: Hydrated ${bulkResult.modifiedCount} documents with institutional walls.`);
        // }
    })
}




module.exports = { fetchBatchWeeklyOptionsContracts }