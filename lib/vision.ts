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
