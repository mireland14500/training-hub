/**
 * Which country a HYROX race was in, from the city in its name ("HYROX Birmingham" → England).
 * Flags are emoji; England, Scotland and Wales use their own flags, as on the event patches.
 */

const CITIES: Record<string, string> = {
  // UK & Ireland
  birmingham: "ENG", london: "ENG", manchester: "ENG", liverpool: "ENG", leeds: "ENG", newcastle: "ENG", excel: "ENG", olympia: "ENG",
  cardiff: "WLS", glasgow: "SCT", edinburgh: "SCT", aberdeen: "SCT", belfast: "GB", dublin: "IE", cork: "IE",
  // Europe
  malaga: "ES", "málaga": "ES", madrid: "ES", barcelona: "ES", valencia: "ES", bilbao: "ES", sevilla: "ES", seville: "ES",
  paris: "FR", lyon: "FR", nice: "FR", bordeaux: "FR", marseille: "FR", lille: "FR",
  berlin: "DE", hamburg: "DE", munich: "DE", "münchen": "DE", cologne: "DE", "köln": "DE", dusseldorf: "DE", "düsseldorf": "DE", frankfurt: "DE", stuttgart: "DE", karlsruhe: "DE", leipzig: "DE", hannover: "DE", dortmund: "DE", essen: "DE",
  amsterdam: "NL", rotterdam: "NL", maastricht: "NL", utrecht: "NL", eindhoven: "NL",
  brussels: "BE", mechelen: "BE", antwerp: "BE", gent: "BE",
  copenhagen: "DK", stockholm: "SE", gothenburg: "SE", oslo: "NO", helsinki: "FI",
  vienna: "AT", wien: "AT", zurich: "CH", "zürich": "CH", geneva: "CH", basel: "CH",
  milan: "IT", milano: "IT", rome: "IT", roma: "IT", turin: "IT", bologna: "IT", verona: "IT",
  lisbon: "PT", lisboa: "PT", porto: "PT", warsaw: "PL", poznan: "PL", gdansk: "PL", krakow: "PL",
  prague: "CZ", budapest: "HU", athens: "GR", istanbul: "TR",
  // Middle East
  dubai: "AE", "abu dhabi": "AE", doha: "QA", riyadh: "SA", jeddah: "SA",
  // Americas
  "new york": "US", nyc: "US", chicago: "US", dallas: "US", houston: "US", "los angeles": "US", anaheim: "US", miami: "US", boston: "US",
  washington: "US", denver: "US", phoenix: "US", "las vegas": "US", atlanta: "US", nashville: "US", "fort lauderdale": "US", "salt lake": "US",
  toronto: "CA", vancouver: "CA", montreal: "CA", "mexico city": "MX", "cdmx": "MX", "são paulo": "BR", "sao paulo": "BR", rio: "BR", "buenos aires": "AR",
  // Asia-Pacific & Africa
  sydney: "AU", melbourne: "AU", brisbane: "AU", perth: "AU", "gold coast": "AU", auckland: "NZ",
  singapore: "SG", "hong kong": "HK", seoul: "KR", incheon: "KR", tokyo: "JP", yokohama: "JP", shanghai: "CN", beijing: "CN", shenzhen: "CN",
  bangkok: "TH", mumbai: "IN", delhi: "IN", "kuala lumpur": "MY", taipei: "TW", jakarta: "ID", manila: "PH",
  "cape town": "ZA", johannesburg: "ZA",
};

const NAMES: Record<string, string> = {
  ENG: "England", SCT: "Scotland", WLS: "Wales", GB: "United Kingdom", IE: "Ireland", ES: "Spain", FR: "France", DE: "Germany", NL: "Netherlands",
  BE: "Belgium", DK: "Denmark", SE: "Sweden", NO: "Norway", FI: "Finland", AT: "Austria", CH: "Switzerland", IT: "Italy", PT: "Portugal",
  PL: "Poland", CZ: "Czechia", HU: "Hungary", GR: "Greece", TR: "Türkiye", AE: "UAE", QA: "Qatar", SA: "Saudi Arabia", US: "USA", CA: "Canada",
  MX: "Mexico", BR: "Brazil", AR: "Argentina", AU: "Australia", NZ: "New Zealand", SG: "Singapore", HK: "Hong Kong", KR: "South Korea",
  JP: "Japan", CN: "China", TH: "Thailand", IN: "India", MY: "Malaysia", TW: "Taiwan", ID: "Indonesia", PH: "Philippines", ZA: "South Africa",
};

// England, Scotland and Wales are emoji tag sequences: 🏴 + "gbeng"/"gbsct"/"gbwls" tags + cancel tag.
const subdivision = (tag: string) => "\u{1F3F4}" + [...tag].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join("") + "\u{E007F}";

function flagOf(code: string): string {
  if (code === "ENG") return subdivision("gbeng");
  if (code === "SCT") return subdivision("gbsct");
  if (code === "WLS") return subdivision("gbwls");
  return [...code].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");
}

export interface RacePlace {
  city: string;
  country: string | null;
  flag: string;
}

/** City, country and flag from a race name like "HYROX Birmingham" or "Malaga Hyrox 2026". */
export function racePlace(name: string): RacePlace {
  const clean = name.replace(/hyrox|doubles|pro|relay|world championships?|elite\s*15|\b20\d\d\b|[–—-]/gi, " ").replace(/\s+/g, " ").trim();
  const lower = name.toLowerCase();
  const hit = Object.keys(CITIES)
    .sort((a, b) => b.length - a.length)
    .find((c) => new RegExp(`(^|[^\\p{L}])${c}([^\\p{L}]|$)`, "iu").test(lower));
  if (!hit) return { city: clean || name, country: null, flag: "🏁" };
  const code = CITIES[hit];
  const city = hit === "malaga" ? "Málaga" : hit.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return { city, country: NAMES[code] ?? null, flag: flagOf(code) };
}
