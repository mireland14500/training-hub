import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const Split = z.object({
  time_s: z.number().nullable().describe("Split time in seconds"),
  distance_m: z.number().nullable(),
  pace_500m_s: z.number().nullable().describe("Pace per 500 m in seconds"),
  watts: z.number().nullable(),
  calories: z.number().nullable(),
  stroke_rate: z.number().nullable().describe("Strokes per minute (s/m)"),
  heart_rate: z.number().nullable(),
});

export const SkiReading = z.object({
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
export type SkiReading = z.infer<typeof SkiReading>;

const PROMPT = `This is a photo of a Concept2 PM5 performance monitor (most likely a SkiErg) at the end of a workout.
Read the summary row and every split/interval row exactly as shown.
- Convert times like "7:42.3" to seconds (462.3). Pace columns are per 500 m.
- "cal" is total calories; "s/m" or "spm" is stroke rate; a heart icon column is heart rate.
- If the screen shows watts or cal/hr instead of pace, put the value in the matching field.
- Use null for anything not visible. Do not guess numbers you cannot read; mention them in notes.`;

let client: Anthropic | null = null;

export async function readSkiMonitor(imageBase64: string, mediaType: "image/jpeg" | "image/png" | "image/webp"): Promise<SkiReading> {
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "low", format: betaZodOutputFormat(SkiReading) },
    // If the request is declined by a safety classifier, retry on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("The photo could not be read. Please enter the numbers manually.");
  if (!response.parsed_output) throw new Error("Could not read the monitor. Try a sharper, straight-on photo.");
  return response.parsed_output;
}
