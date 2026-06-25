const asyncHandler = require("express-async-handler");
const Stock = require("../models/Stock");
const { CSV_HEADER_TRANSLATION_DICT } = require("../Utility/dbHelper");
const fs = require('fs')
const csv = require('csv-parser')
const pdf = require('pdf-parse');



const cleanPercentageToFloat = (valueString) =>
{
    if (!valueString || valueString === '-') return 0;
    const cleanNum = valueString.replace('%', '').trim();
    return isNaN(cleanNum) ? 0 : parseFloat(cleanNum);
};
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

        fs.createReadStream(tempUploadedFilePath)
            .pipe(csv({ mapHeaders: ({ header }) => { return CSV_HEADER_TRANSLATION_DICT[header.trim()]; } }))
            .on('data', (row) =>
            {
                if (!row.Symbol) return;
                const currentSymbol = row.Symbol.trim().toUpperCase();
                const processedDoc = {
                    Symbol: currentSymbol,
                    CompanyName: row.CompanyName ? row.CompanyName.trim() : "",
                    Industry: row.Industry ? row.Industry.trim() : "",
                    MarketCap: (!row.MarketCap || !row.MarketCap.trim() === "") || isNaN(row.MarketCap) ? 0 : parseInt(row.MarketCap),
                    AvgVolume: (!row.AvgVolume || !row.AvgVolume.trim() === "") || isNaN(row.AvgVolume) ? 0 : parseInt(row.AvgVolume),
                    Sector: row.Sector ? row.Sector.trim() : "",
                    Country: row.Country ? row.Country.trim() : "",
                    Beta1Y: (!row.BetaY || !row.Beta1Y.trim() === "") || isNaN(row.Beta1Y) ? 1.0 : parseFloat(row.Beta1Y),

                    NextEarningsDate: parseCleanDate(row.NextEarningsDate),
                    LastEarningsDate: parseCleanDate(row.LastEarningsDate),
                    EarningsDate: parseCleanDate(row.EarningsDate),

                    SharesFloat: (!row.SharesFloat || !row.SharesFloat.trim() === "") || isNaN(row.SharesFloat) ? 0 : parseInt(row.SharesFloat),
                    ShortPercentOfFloat: cleanPercentageToFloat(row.ShortPercentOfFloat),
                    FloatPercentage: cleanPercentageToFloat(row.FloatPercentage),



                    High52W: (!row.High52W || !row.High52W.trim() === "") || isNaN(row.High52W) ? 0 : parseFloat(row.High52W),
                    Low52W: (!row.Low52W || !row.Low52W.trim() === "") || isNaN(row.Low52W) ? 0 : parseFloat(row.Low52W),
                    Low52WDate: parseCleanDate(row.Low52WDate),
                    High52WDate: parseCleanDate(row.High52WDate),

                    HasOptions: row.HasOptions?.toLowerCase() === 'yes',
                    RelativeVolume: (!row.RelativeVolume || !row.RelativeVolume.trim() === "") || isNaN(row.RelativeVolume) ? 1.0 : parseFloat(row.RelativeVolume).toFixed(2),
                    MonthlyRsi: (!row.MonthlyRsi || !row.MonthlyRsi.trim() === "") || isNaN(row.MonthlyRsi) ? 50.0 : parseFloat(row.MonthlyRsi),
                    DailyRsi: (!row.DailyRsi || !row.DailyRsi.trim() === "") || isNaN(row.DailyRsi) ? 50.0 : parseFloat(row.DailyRsi),
                    MA20Price: (!row.MA20Price || !row.MA20Price.trim() === "") || isNaN(row.MA20Price) ? 0 : parseFloat(row.MA20Price),
                    MA200Price: (!row.MA200Price || !row.MA200Price.trim() === "") || isNaN(row.MA200Price) ? 0 : parseFloat(row.MA200Price),

                    PreMarketPercentChange: cleanPercentageToFloat(row.PreMarketPercentChange),
                    PreMarketVolume: (!row.PreMarketVolume || !row.PreMarketVolume.trim() === "") || isNaN(row.PreMarketVolume) ? 0 : parseInt(row.PreMarketVolume),
                    ShortRatioDaysToCover: (!row.ShortRatioDaysToCover || !row.ShortRatioDaysToCover.trim() === "") || isNaN(row.ShortRatioDaysToCover) ? 0 : parseFloat(row.ShortRatioDaysToCover),
                    DaysGapPercent: cleanPercentageToFloat(row.DaysGapPercent),
                    PositionInRangePercent: cleanPercentageToFloat(row.PositionInRangePercent),
                    ShortPercentOfShares: cleanPercentageToFloat(row.ShortPercentOfShares),
                    InstitutionalSharePercent: cleanPercentageToFloat(row.InstitutionalSharePercent),
                    LastUpdated: new Date()
                };

                // 3. BUILD BULK OPERATIONS: Update existing symbols or create new ones
                bulkOperationsBuffer.push({
                    updateOne: {
                        filter: { Symbol: currentSymbol },
                        update: { $set: processedDoc },
                        upsert: true
                    }
                });
            })
            .on('end', async () =>
            {
                try
                {
                    if (bulkOperationsBuffer.length > 0) { const bulkResult = await Stock.bulkWrite(bulkOperationsBuffer); }
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

const uploadExpectedMovesCoreFile = asyncHandler(async (req, res) =>
{
    try
    {
        if (!req.file)
        {
            return res.status(400).json({ error: 'No file uploaded.' });
        }
        console.log(req.file)
        // Convert file buffer to string
        const fileContent = req.file.buffer.toString('utf-8');

        // Split text by semicolon to separate each ticker entry
        const entries = fileContent.split(';');
        const parsedData = [];

        for (let entry of entries)
        {
            const cleanEntry = entry.trim();
            if (!cleanEntry) continue; // Skip trailing empty entries

            // Split the entry by commas
            const parts = cleanEntry.split(',');

            if (parts.length === 5)
            {
                parsedData.push({
                    ticker: parts[0].trim(),
                    std1High: parseFloat(parts[1]),
                    std1Low: parseFloat(parts[2]),
                    std2High: parseFloat(parts[3]),
                    std2Low: parseFloat(parts[4]),
                    std: parseFloat(((parseFloat(parts[1]) - parseFloat(parts[2])) / 2).toFixed(2)),
                    priorClose: parseFloat(parts[1]) - ((parseFloat(parts[1]) - parseFloat(parts[2])) / 2)
                });
            }
        }
        console.log('Save this info to db some how')

        // Return parsed JSON structure back to frontend
        return res.status(200).json({
            message: 'File processed successfully',
            count: parsedData.length,
            data: parsedData
        });

    } catch (error)
    {
        console.error(error);
        return res.status(500).json({ error: 'Internal server error.' });
    }

})

const uploadZoneFile = asyncHandler(async (req, res) =>
{
    try
    {
        if (!req.file) { return res.status(400).json({ error: 'No file uploaded.' }); }

        // 1. Extract raw text from the PDF buffer
        const parser = await new pdf.PDFParse({ data: req.file.buffer });
        const pdfData = await parser.getText()
        const rawText = pdfData.text;

        // 2. Split the text into individual lines
        const lines = rawText.split('\n');
        const parsedObjects = [];

        // 3. Skip the first two lines (header lines)
        // Adjust this slice if your PDF text outputs different header lines
        const dataLines = lines.slice(2);

        for (let line of dataLines)
        {
            const cleanLine = line.trim();
            if (!cleanLine) continue; // Skip empty lines

            // Split the line by one or more spaces
            const columns = cleanLine.split(/\s+/);

            // Your example rows contain exactly 9 data elements
            if (columns.length === 9)
            {
                parsedObjects.push({
                    symbol: columns[0],
                    low: parseFloat(columns[1]),
                    mid: parseFloat(columns[2]),
                    high: parseFloat(columns[3]),
                    close: parseFloat(columns[4]),
                    upside: parseFloat(columns[5]),
                    downside: parseFloat(columns[6]),
                    range: parseFloat(columns[7]),
                    trend: parseFloat(columns[8])
                });
            }
        }
        console.log("Do something with uploading zone documents")

        return res.status(200).json({
            message: 'PDF processed successfully',
            count: parsedObjects.length,
            data: parsedObjects
        });

    } catch (error)
    {
        console.error('PDF Processing Error:', error);
        return res.status(500).json({ error: 'Failed to process PDF file.' });
    }

})

module.exports = { uploadStockCSVFile, uploadExpectedMovesCoreFile, uploadZoneFile }