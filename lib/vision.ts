import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

// ---------------------------------------------------------------------------
// Erg monitor (Concept2 PM5)
// ---------------------------------------------------------------------------

const Split = z.object({
  time_s: z.number().nullable().describe("Split time in seconds"),
  distance_m: z.number().nullable(),
  pace_500m_s: z.number().nullable().describe("Pace per 500 m in seconds"),
  watts: z.number().nullable(),
  calories: z.number().nullable(),
  stroke_rate: z.number().nullable().describe("Strokes per minute (s/m)"),
  heart_rate: z.number().nullable(),
});

export const ErgReading = z.object({
  machine: z.enum(["SkiErg", "RowErg", "BikeErg", "Other"]),
  workout_description: z.string().describe('What the monitor says the workout was, e.g. "2000m", "30:00", "8x500m/1:00r"'),
  total_time_s: z.number().nullable().describe("Total work time in seconds (excluding rest)"),
  distance_m: z.number().nullable(),
  calories: z.number().nullable(),
  avg_pace_500m_s: z.number().nullable(),
  avg_watts: z.number().nullable(),
  avg_stroke_rate: z.number().nullable(),
  avg_heart_rate: z.number().nullable(),
  splits: z.array(Split).describe("Each split or interval row, in order"),
  notes: z.string().describe("Anything unclear or unreadable on the screen; empty string if none"),
});
export type ErgReading = z.infer<typeof ErgReading>;

const ERG_PROMPT = `This is a photo of a Concept2 PM5 performance monitor (SkiErg, RowErg or BikeErg) at the end of a workout.
Identify the machine (SkiErg monitors sit at the top of a tall upright frame with two handles; RowErg is a horizontal rower; BikeErg is a bike — if unsure, say SkiErg).
Read the summary row and every split/interval row exactly as shown.
- Convert times like "7:42.3" to seconds (462.3). Pace columns are per 500 m (per 1000 m on BikeErg — convert to per 500 m).
- "cal" is total calories; "s/m", "spm" or "rpm" is stroke rate; a heart icon column is heart rate.
- If the screen shows watts or cal/hr instead of pace, put the value in the matching field.
- Use null for anything not visible. Do not guess numbers you cannot read; mention them in notes.`;

// ---------------------------------------------------------------------------
// HYROX results (official results page/app screenshot, or a whiteboard of sim splits)
// ---------------------------------------------------------------------------

const StationSplits = z.object({
  ski: z.number().nullable().describe("SkiErg 1000 m, seconds"),
  sled_push: z.number().nullable(),
  sled_pull: z.number().nullable(),
  bbj: z.number().nullable().describe("Burpee broad jumps"),
  row: z.number().nullable().describe("Row 1000 m"),
  farmers: z.number().nullable().describe("Farmers carry"),
  lunges: z.number().nullable().describe("Sandbag lunges"),
  wall_balls: z.number().nullable(),
});

export const HyroxReading = z.object({
  total_time_s: z.number().nullable(),
  runs: z.array(z.number().nullable()).describe("Run 1 to Run 8 split times in seconds, in order; null where missing"),
  stations: StationSplits,
  roxzone_s: z.number().nullable().describe("Total Roxzone / transition time in seconds"),
  division: z.string().describe('Division if shown, e.g. "Open Men"; empty string if not shown'),
  notes: z.string().describe("Anything unclear; empty string if none"),
});
export type HyroxReading = z.infer<typeof HyroxReading>;

const HYROX_PROMPT = `This image shows HYROX race or simulation results — an official results screenshot, a timing app, or handwritten splits.
HYROX is 8 × (1 km run + station) in this order: SkiErg, Sled Push, Sled Pull, Burpee Broad Jumps, Row, Farmers Carry, Sandbag Lunges, Wall Balls.
Extract each run split (Run 1–8), each station time, total Roxzone time and the total time, all in seconds ("4:32" = 272, "1:02:15" = 3735).
Some results show cumulative times — convert those to individual segment times.
Use null for anything not shown. Do not guess; mention unclear values in notes.`;

// ---------------------------------------------------------------------------
// Any workout: gym-class whiteboard, written plan, treadmill/erg screen, app screenshot
// ---------------------------------------------------------------------------

const WorkoutEntry = z.object({
  exercise: z.enum(["run", "treadmill", "ski", "row", "bike", "sled_push", "sled_pull", "wall_balls", "lunges", "bbj", "farmers", "other"]),
  name: z.string().nullable().describe('Exercise name as written, required for "other" (e.g. "KB swings")'),
  sets: z.number().nullable().describe("Number of sets/rounds/reps of this block"),
  distance_m: z.number().nullable().describe("Distance per set in metres"),
  reps: z.number().nullable().describe("Repetitions per set (wall balls, burpees, strength moves)"),
  time_s: z.number().nullable().describe("Time per set in seconds (or derived from a pace)"),
  speed_kmh: z.number().nullable().describe("Treadmill speed in km/h"),
  incline_pct: z.number().nullable().describe("Treadmill incline in %"),
  weight_kg: z.number().nullable().describe("Load in kg (sled total, per-hand for carries, ball/bag weight)"),
  notes: z.string().nullable().describe("Rest, effort cues, anything else for this block"),
});

export const WorkoutReading = z.object({
  title: z.string().describe('Short name for the session, e.g. "Threshold class: ski + treadmill"'),
  focus: z.enum(["easy", "long", "threshold", "intervals", "hyrox", "strength", "recovery", "race", "unknown"]),
  duration_s: z.number().nullable().describe("Total session duration if shown"),
  entries: z.array(WorkoutEntry).describe("One entry per block/exercise, in order"),
  notes: z.string().describe("Anything unclear or not captured; empty string if none"),
});
export type WorkoutReading = z.infer<typeof WorkoutReading>;

const WORKOUT_PROMPT = `This image shows a workout someone did — e.g. a gym class whiteboard, a written plan, a treadmill or erg screen, or an app screenshot.
Turn it into a list of blocks. Exercise mapping:
- run (outdoor/track), treadmill, ski (SkiErg), row (rower), bike (BikeErg/assault/echo bike)
- sled_push, sled_pull, wall_balls, lunges (sandbag/walking lunges), bbj (burpee broad jumps / burpees), farmers (farmers/kettlebell carry)
- other: anything else (name it, e.g. "KB swings", "Deadlift")
Rules:
- Values are PER SET. "4 × 500 m ski @ 1:50" → sets 4, distance_m 500, time_s 110 (1:50/500 m × 500 m).
- Convert paces to time per set: /km paces × km, /500 m paces × (m/500). Times like "3:45" = 225 s.
- Treadmill: speed in km/h (mph × 1.609), incline in %. If only speed and time are given, leave distance null.
- Weights in kg (lb × 0.4536). Sled weight = total including the sled if that is what's written.
- Pick the focus that best describes the session (threshold, intervals, hyrox, strength…), or "unknown".
- Use null for anything not shown. Do not invent numbers; mention unclear items in notes.`;

// ---------------------------------------------------------------------------
// InBody result sheet or app screenshot
// ---------------------------------------------------------------------------

const Segments = z.object({
  right_arm: z.number().nullable(),
  left_arm: z.number().nullable(),
  trunk: z.number().nullable(),
  right_leg: z.number().nullable(),
  left_leg: z.number().nullable(),
});

export const InBodyReading = z.object({
  date: z.string().nullable().describe("Test date as YYYY-MM-DD if shown"),
  weight_kg: z.number().nullable(),
  skeletal_muscle_kg: z.number().nullable().describe("Skeletal Muscle Mass (SMM)"),
  body_fat_kg: z.number().nullable().describe("Body Fat Mass"),
  body_fat_pct: z.number().nullable().describe("Percent Body Fat (PBF)"),
  lean_mass_kg: z.number().nullable().describe("Fat Free Mass, or Lean Body Mass if that is what is shown"),
  total_body_water_l: z.number().nullable(),
  visceral_fat_level: z.number().nullable(),
  bmr_kcal: z.number().nullable().describe("Basal Metabolic Rate"),
  inbody_score: z.number().nullable(),
  segmental_lean_kg: Segments.describe("Segmental Lean Analysis in kg (not %)"),
  notes: z.string().describe("Anything unclear; empty string if none"),
});
export type InBodyReading = z.infer<typeof InBodyReading>;

const INBODY_PROMPT = `This image is a body-composition result — an InBody result sheet, the InBody app, or a similar scale/report.
Read the values for this test only (ignore history columns and normal-range bars).
- Weights in kg (lb × 0.4536). Body water in litres.
- Segmental lean values are the kg figures for each arm, trunk and leg — not the percentage underneath.
- The date is the test date, as YYYY-MM-DD.
Use null for anything not shown. Do not guess; mention unclear values in notes.`;

let client: Anthropic | null = null;

async function readImage<T extends z.ZodType>(schema: T, prompt: string, imageBase64: string, mediaType: ImageType): Promise<z.infer<T>> {
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    // If the request is declined by a safety classifier, retry on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("The photo could not be read. Please enter the numbers manually.");
  if (!response.parsed_output) throw new Error("Could not read the photo. Try a sharper, straight-on shot.");
  return response.parsed_output as z.infer<T>;
}

export function readErgMonitor(imageBase64: string, mediaType: ImageType): Promise<ErgReading> {
  return readImage(ErgReading, ERG_PROMPT, imageBase64, mediaType);
}

export function readHyroxResults(imageBase64: string, mediaType: ImageType): Promise<HyroxReading> {
  return readImage(HyroxReading, HYROX_PROMPT, imageBase64, mediaType);
}

export function readInBody(imageBase64: string, mediaType: ImageType): Promise<InBodyReading> {
  return readImage(InBodyReading, INBODY_PROMPT, imageBase64, mediaType);
}

export function readWorkout(imageBase64: string, mediaType: ImageType): Promise<WorkoutReading> {
  return readImage(WorkoutReading, WORKOUT_PROMPT, imageBase64, mediaType);
}
