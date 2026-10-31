import { racePlace } from "@/lib/raceCountry";

const YELLOW = "#ffe100";
const INK = "#141414";

/**
 * A HYROX-style event patch: dark disc, stitched yellow ring, the country's flag in the middle,
 * the city curved across the top and the year across the bottom.
 */
export default function RacePatch({ name, date, size = 56 }: { name: string; date: string; size?: number }) {
  const place = racePlace(name);
  const year = date.slice(0, 4);
  const id = `patch-${place.city.replace(/[^a-z]/gi, "").toLowerCase() || "race"}-${year}-${size}`;
  const city = place.city.toUpperCase().slice(0, 14);
  // Long names need a smaller font to fit the arc.
  const cityFont = city.length > 10 ? 9 : city.length > 7 ? 10.5 : 12;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${place.city}${place.country ? `, ${place.country}` : ""} ${year}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full drop-shadow-sm" aria-hidden>
        <defs>
          <path id={`${id}-top`} d="M 18 50 A 32 32 0 0 1 82 50" />
          <path id={`${id}-bottom`} d="M 20 54 A 30 30 0 0 0 80 54" />
        </defs>
        <circle cx="50" cy="50" r="48" fill={INK} stroke={YELLOW} strokeWidth="3" />
        <circle cx="50" cy="50" r="43" fill="none" stroke={YELLOW} strokeWidth="1.2" strokeDasharray="2.2 2.4" opacity="0.85" />
        <circle cx="50" cy="50" r="23" fill="#ffffff" opacity="0.08" />
        <text fill={YELLOW} fontSize={cityFont} fontWeight={800} letterSpacing="1.2" textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif">
          <textPath href={`#${id}-top`} startOffset="50%">{city}</textPath>
        </text>
        <text fill={YELLOW} fontSize="10" fontWeight={700} letterSpacing="2" textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif">
          <textPath href={`#${id}-bottom`} startOffset="50%">{year}</textPath>
        </text>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center leading-none" style={{ fontSize: size * 0.36 }} aria-hidden>
        {place.flag}
      </span>
    </span>
  );
}
