export type MarketUniverseId =
  | "global"
  | "us-equities"
  | "international-equities"
  | "funds-indices"
  | "rates-credit"
  | "commodities"
  | "fx"
  | "crypto"
  | "custom";

const US_EQUITIES = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "BRK-B", "TSLA",
  "AVGO", "JPM", "V", "MA", "WMT", "XOM", "UNH", "COST", "ORCL",
  "HD", "PG", "JNJ", "ABBV", "BAC", "KO", "NFLX", "CRM", "CVX",
  "MRK", "PEP", "TMO", "LIN", "CSCO", "ADBE", "AMD", "QCOM", "TXN",
  "INTU", "AMAT", "CAT", "GE", "IBM", "BA", "GS", "MS", "C", "PFE",
  "DIS", "MCD", "NKE", "SBUX", "UBER", "PLTR", "NOW", "PANW", "BKNG",
  "ISRG", "SPGI", "AXP", "COP", "RTX", "HON",
] as const;

const INTERNATIONAL_EQUITIES = [
  "0700.HK", "9988.HK", "0005.HK", "1299.HK", "3690.HK", "1810.HK",
  "9618.HK", "2318.HK", "0388.HK", "0941.HK", "7203.T", "6758.T",
  "9984.T", "8306.T", "6861.T", "8035.T", "6501.T", "7267.T",
  "ASML.AS", "SAP.DE", "SIE.DE", "MC.PA", "OR.PA", "AIR.PA", "NESN.SW",
  "NOVN.SW", "UBSG.SW", "AZN.L", "SHEL.L", "HSBA.L", "ULVR.L", "RIO.L",
  "BHP.AX", "CBA.AX", "CSL.AX", "RELIANCE.NS", "TCS.NS", "INFY.NS",
] as const;

const FUNDS_AND_INDICES = [
  "SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "EFA", "EEM", "VGK", "EWJ",
  "FXI", "INDA", "ARKK", "XLE", "XLF", "XLK", "XLV", "XLI", "XLY", "XLP",
  "XLU", "XLB", "XLRE", "VNQ", "SCHD", "VIG", "MTUM", "QUAL", "USMV",
  "^GSPC", "^IXIC", "^DJI", "^RUT", "^VIX", "^FTSE", "^N225", "^HSI",
  "^GDAXI", "^FCHI", "^STOXX50E", "000001.SS",
] as const;

const RATES_AND_CREDIT = [
  "TLT", "IEF", "SHY", "GOVT", "AGG", "BND", "TIP", "LQD", "HYG", "JNK",
  "EMB", "BKLN", "MUB", "^TNX", "^FVX", "^IRX",
] as const;

const COMMODITIES = [
  "GLD", "SLV", "USO", "UNG", "DBA", "DBC", "PDBC", "CPER", "URA", "WOOD",
  "GC=F", "SI=F", "CL=F", "NG=F", "HG=F", "ZC=F", "ZW=F", "KC=F",
] as const;

const FX = [
  "EURUSD=X", "GBPUSD=X", "USDJPY=X", "AUDUSD=X", "USDCAD=X", "USDCHF=X",
  "NZDUSD=X", "EURJPY=X", "EURGBP=X", "GBPJPY=X", "HKD=X",
] as const;

const CRYPTO = [
  "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "BNB-USD", "ADA-USD",
  "DOGE-USD", "AVAX-USD", "LINK-USD", "LTC-USD", "DOT-USD", "BCH-USD",
] as const;

const GLOBAL = [
  ...US_EQUITIES,
  ...INTERNATIONAL_EQUITIES,
  ...FUNDS_AND_INDICES,
  ...RATES_AND_CREDIT,
  ...COMMODITIES,
  ...FX,
  ...CRYPTO,
] as const;

export interface MarketUniverseDefinition {
  id: MarketUniverseId;
  label: string;
  description: string;
  symbols: readonly string[];
}

export const MARKET_UNIVERSES: Record<Exclude<MarketUniverseId, "custom">, MarketUniverseDefinition> = {
  global: {
    id: "global",
    label: "Global multi-asset",
    description: "Liquid equities, funds, indices, rates, commodities, FX, and crypto across major markets.",
    symbols: GLOBAL,
  },
  "us-equities": {
    id: "us-equities",
    label: "US equities",
    description: "Large and actively traded US-listed companies across major sectors.",
    symbols: US_EQUITIES,
  },
  "international-equities": {
    id: "international-equities",
    label: "International equities",
    description: "Representative liquid listings from Hong Kong, Japan, Europe, Australia, and India.",
    symbols: INTERNATIONAL_EQUITIES,
  },
  "funds-indices": {
    id: "funds-indices",
    label: "ETFs & indices",
    description: "Broad, regional, sector, factor, and major market index exposures.",
    symbols: FUNDS_AND_INDICES,
  },
  "rates-credit": {
    id: "rates-credit",
    label: "Rates & credit",
    description: "Government bond, inflation, investment-grade, high-yield, and Treasury-rate proxies.",
    symbols: RATES_AND_CREDIT,
  },
  commodities: {
    id: "commodities",
    label: "Commodities",
    description: "Commodity funds and liquid futures across metals, energy, and agriculture.",
    symbols: COMMODITIES,
  },
  fx: {
    id: "fx",
    label: "Foreign exchange",
    description: "Major and selected cross currency pairs quoted through the market-data provider.",
    symbols: FX,
  },
  crypto: {
    id: "crypto",
    label: "Crypto assets",
    description: "Large, liquid crypto assets quoted against USD.",
    symbols: CRYPTO,
  },
};

export const MARKET_UNIVERSE_OPTIONS = [
  ...Object.values(MARKET_UNIVERSES).map((universe) => ({
    id: universe.id,
    label: universe.label,
    count: universe.symbols.length,
    description: universe.description,
  })),
  {
    id: "custom" as const,
    label: "Custom symbols",
    count: 0,
    description: "Paste a provider-supported list of symbols to rank.",
  },
];

export function isMarketUniverseId(value: string): value is MarketUniverseId {
  return value === "custom" || Object.prototype.hasOwnProperty.call(MARKET_UNIVERSES, value);
}

export function getMarketUniverseSymbols(id: Exclude<MarketUniverseId, "custom">): string[] {
  return [...new Set(MARKET_UNIVERSES[id].symbols)];
}
