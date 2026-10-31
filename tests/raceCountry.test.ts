import { describe, expect, it } from "vitest";
import { racePlace } from "@/lib/raceCountry";

describe("race place", () => {
  it("finds the city and country", () => {
    expect(racePlace("HYROX Birmingham")).toMatchObject({ city: "Birmingham", country: "England" });
    expect(racePlace("HYROX Málaga")).toMatchObject({ city: "Málaga", country: "Spain", flag: "🇪🇸" });
    expect(racePlace("Malaga hyrox 2026")).toMatchObject({ city: "Málaga", country: "Spain" });
    expect(racePlace("HYROX Cardiff Pro Doubles")).toMatchObject({ city: "Cardiff", country: "Wales" });
    expect(racePlace("Hyrox Dublin")).toMatchObject({ country: "Ireland", flag: "🇮🇪" });
    expect(racePlace("HYROX New York")).toMatchObject({ city: "New York", country: "USA" });
  });
  it("falls back to a chequered flag", () => {
    expect(racePlace("Morning Workout")).toMatchObject({ country: null, flag: "🏁" });
    // "nice" only as a whole word
    expect(racePlace("Nice HYROX sim").country).toBe("France");
    expect(racePlace("A very nicely paced sim").country).toBeNull();
  });
});
