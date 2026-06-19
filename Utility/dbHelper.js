/**
 * Master CSV Header Translation Dictionary.
 * Maps exact stockanalysis.com CSV header strings straight to 
 * your database-friendly, camelCase Mongoose variable names.
 */
const CSV_HEADER_TRANSLATION_DICT = {
    "Symbol": "tickerSymbol",
    "Company Name": "companyName",
    "Industry": "industry",
    "Market Cap": "marketCap",
    "Avg. Volume": "avgVolume",
    "Sector": "sector",
    "Country": "country",
    "Beta (1Y)": "beta1Y",
    "Next Earnings": "nextEarningsDate",
    "Last Earnings": "lastEarningsDate",
    "Earnings Date": "earningsDate",
    "Float": "sharesFloat",
    "Short % Float": "shortPercentOfFloat",
    "Float (%)": "floatPercentage", // Collision Resolved Automatically!
    "52W High": "high52W",
    "52W Low": "low52W",
    "52W Low Date": "low52WDate",
    "52W High Date": "high52WDate",
    "Options": "hasOptions",
    "Rel. Volume": "relativeVolume",
    "RSI (M)": "monthlyRsi",
    "RSI": "dailyRsi",
    "20 MA": "ma20Price",
    "200 MA": "ma200Price",
    "Premkt. Chg%": "premarketPercentChange",
    "Pre. Volume": "premarketVolume",
    "Short Ratio": "shortRatioDaysToCover",
    "Gap (%)": "daysGapPercent",
    "Pos. Range": "positionInRangePercent",
    "Short % Shares": "shortPercentOfShares"
};

module.exports = { CSV_HEADER_TRANSLATION_DICT }