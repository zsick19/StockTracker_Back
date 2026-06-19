const asyncHandler = require("express-async-handler");
const Stock = require("../models/Stock");




// Configure Multer to temporarily cache the uploaded CSV file inside your system's temp directory
const upload = multer({ dest: '/tmp/' });

/**
 * Helper to safely sanitize percentage strings and convert them into pure floats
 * Converts "1.85%" -> 1.85, handles invalid entries or hyphens gracefully.
 */
const cleanPercentageToFloat = (valueString) =>
{
    if (!valueString || valueString === '-') return 0;
    const cleanNum = valueString.replace('%', '').trim();
    return isNaN(cleanNum) ? 0 : parseFloat(cleanNum);
};

/**
 * Helper to cleanly convert text strings into clean dates or null values
 */
const parseCleanDate = (dateString) =>
{
    if (!dateString || dateString.trim() === '' || dateString === '-') return null;
    const dateObj = new Date(dateString.trim());
    return isNaN(dateObj.getTime()) ? null : dateObj;
};

const uploadStockCSVFile = asyncHandler(async (req, res) =>
{
    try
    {
        if (!req.file) return res.status(400).json({ success: false, error: "No CSV snapshot file detected in multi-part payload." });


        const bulkOperationsBuffer = [];
        const tempUploadedFilePath = req.file.path;

        console.log("📡 Ingestion Booted: Streaming and processing raw stockanalysis.com lines...");

        fs.createReadStream(tempUploadedFilePath)
            .pipe(csv({
                // THE DICTIONARY MAP FUNCTION: Bypasses string cutting completely! [INDEX]
                mapHeaders: ({ header }) =>
                {
                    const cleanHeaderString = header.trim();

                    // Look up the exact header inside our translation dictionary
                    const dbFriendlyKey = CSV_HEADER_TRANSLATION_DICT[cleanHeaderString];

                    // If the header matches a dictionary item, return it [INDEX].
                    // Fallback to a sanitized lowercase key if an unexpected column appears.
                    return dbFriendlyKey || cleanHeaderString.replace(/\s+/g, '').toLowerCase();
                }
            }))
            .on('data', (row) =>
            {
                // Since mapHeaders updated the keys, we pull row values using our EXACT database variable names!
                if (!row.tickerSymbol) return;

                const currentSymbol = row.tickerSymbol.trim().toUpperCase();

                const processedDoc = {
                    tickerSymbol: currentSymbol,
                    companyName: row.companyName ? row.companyName.trim() : "",
                    industry: row.industry ? row.industry.trim() : "",
                    marketCap: isNaN(row.marketCap) ? 0 : parseInt(row.marketCap),
                    avgVolume: isNaN(row.avgVolume) ? 0 : parseInt(row.avgVolume),
                    sector: row.sector ? row.sector.trim() : "",
                    country: row.country ? row.country.trim() : "",
                    beta1Y: isNaN(row.beta1Y) ? 1.0 : parseFloat(row.beta1Y),

                    nextEarningsDate: parseCleanDate(row.nextEarningsDate),
                    lastEarningsDate: parseCleanDate(row.lastEarningsDate),
                    earningsDate: parseCleanDate(row.earningsDate),

                    sharesFloat: isNaN(row.sharesFloat) ? 0 : parseInt(row.sharesFloat),
                    shortPercentOfFloat: cleanPercentageToFloat(row.shortPercentOfFloat),
                    floatPercentage: cleanPercentageToFloat(row.floatPercentage),



                    high52W: isNaN(row.high52W) ? 0 : parseFloat(row.high52W),
                    low52W: isNaN(row.low52W) ? 0 : parseFloat(row.low52W),
                    low52WDate: parseCleanDate(row.low52WDate),
                    high52WDate: parseCleanDate(row.high52WDate),

                    hasOptions: row.hasOptions?.toLowerCase() === 'yes',
                    relativeVolume: isNaN(row.relativeVolume) ? 1.0 : parseFloat(row.relativeVolume),
                    monthlyRsi: isNaN(row.monthlyRsi) ? 50.0 : parseFloat(row.monthlyRsi),
                    dailyRsi: isNaN(row.dailyRsi) ? 50.0 : parseFloat(row.dailyRsi),
                    ma20Price: isNaN(row.ma20Price) ? 0 : parseFloat(row.ma20Price),
                    ma200Price: isNaN(row.ma200Price) ? 0 : parseFloat(row.ma200Price),

                    premarketPercentChange: cleanPercentageToFloat(row.premarketPercentChange),
                    premarketVolume: isNaN(row.premarketVolume) ? 0 : parseInt(row.premarketVolume),
                    shortRatioDaysToCover: isNaN(row.shortRatioDaysToCover) ? 0 : parseFloat(row.shortRatioDaysToCover),
                    daysGapPercent: cleanPercentageToFloat(row.daysGapPercent),
                    positionInRangePercent: cleanPercentageToFloat(row.positionInRangePercent),
                    shortPercentOfShares: cleanPercentageToFloat(row.shortPercentOfShares),
                    lastUpdated: new Date()
                };

                // 3. BUILD BULK OPERATIONS: Update existing symbols or create new ones
                bulkOperationsBuffer.push({
                    updateOne: {
                        filter: { tickerSymbol: currentSymbol },
                        update: { $set: processedDoc },
                        upsert: true
                    }
                });
            })
            .on('end', async () =>
            {
                try
                {
                    if (bulkOperationsBuffer.length > 0)
                    {
                        const bulkResult = await StockInfoModel.bulkWrite(bulkOperationsBuffer);
                        console.log(`✨ Dictionary Ingestion Matrix Synchronized: Updated ${bulkResult.upsertedCount + bulkResult.modifiedCount} records.`);
                    }
                    fs.unlinkSync(tempUploadedFilePath);
                    return res.json({ success: true, recordsProcessed: bulkOperationsBuffer.length });
                } catch (dbError)
                {
                    if (fs.existsSync(tempUploadedFilePath)) fs.unlinkSync(tempUploadedFilePath);
                    return res.status(500).json({ success: false, error: dbError.message });
                }
            });

    } catch (globalError)
    {
        return res.status(500).json({ success: false, error: globalError.message });
    }






});



module.exports = { uploadStockCSVFile }