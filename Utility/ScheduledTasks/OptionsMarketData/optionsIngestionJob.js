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

                    const rawContractsArray = parsedJsonPayload.option_contracts || [];
                    console.log(rawContractsArray)

                    // 2. Initialize a clean dictionary map to separate contracts by ticker
                    const groupedContractsMap = {};
                    watchlistSymbolsArray.forEach(symbol => { groupedContractsMap[symbol] = []; });

                    // 3. SINGLE PASS CLASSIFICATION LOOP
                    // Sort out the returning array contracts into their corresponding parent buckets
                    rawContractsArray.forEach(contract =>
                    {
                        const rootTicker = contract.underlying_symbol;

                        if (groupedContractsMap[rootTicker])
                        {
                            // Save only the strict contract symbol key code
                            groupedContractsMap[rootTicker].push(contract.symbol);
                        }
                    });

                    console.log(`✨ Batch Options Ingestion Complete: Successfully mapped contracts across ${watchlistSymbolsArray.length} tickers.`);
                    resolve(groupedContractsMap);

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

module.exports = { fetchBatchWeeklyOptionsContracts }