/**
 * Master CSV Header Translation Dictionary.
 * Maps exact stockanalysis.com CSV header strings straight to 
 * your database-friendly, camelCase Mongoose variable names.
 */
const CSV_HEADER_TRANSLATION_DICT = {
    "Symbol": "Symbol",
    "Company Name": "CompanyName",
    "Industry": "Industry",
    "Market Cap": "MarketCap",
    "Avg. Volume": "AvgVolume",
    "Sector": "Sector",
    "Country": "Country",
    "Beta (1Y)": "Beta1Y",
    "Next Earnings": "NextEarnings",
    "Last Earnings": "LastEarnings",
    "Earnings Date": "EarningsDate",
    "Float": "SharesFloat",
    "Short % Float": "ShortPercentOfFloat",
    "Float (%)": "FloatPercentage",
    "52W High": "High52W",
    "52W Low": "Low52W",
    "52W Low Date": "Low52WDate",
    "52W High Date": "High52WDate",
    "Options": "HasOptions",
    "Rel. Volume": "RelativeVolume",
    "RSI (M)": "MonthlyRsi",
    "RSI": "DailyRsi",
    "20 MA": "MA20Price",
    "200 MA": "MA200Price",
    "Premkt. Chg%": "PreMarketPercentChange",
    "Pre. Volume": "PreMarketVolume",
    "Short Ratio": "ShortRatioDaysToCover",
    "Gap (%)": "DaysGapPercent",
    "Pos. Range": "PositionInRangePercent",
    "Short % Shares": "ShortPercentOfShares",
    "Shares Institut.":"InstitutionalSharePercent"
};

module.exports = { CSV_HEADER_TRANSLATION_DICT }