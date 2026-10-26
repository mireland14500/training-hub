/**
 * Race fuelling: a short carb load and race-morning plan, scaled to body weight.
 * HYROX (60–90 min, very intense): 7–12 g/kg in the 24 h before is the evidence-based range;
 * the full 10–12 g/kg × 2 days marathon load isn't needed. Pure functions.
 */

export interface Food {
  name: string;
  portion: string;
  carbs: number;
}

/** Low-fibre, low-fat carbs that are easy to eat in quantity. Carbs per portion in grams. */
export const FOODS = {
  bagel: { name: "Bagel", portion: "1 plain", carbs: 50 },
  jam: { name: "Jam or honey", portion: "1 tbsp", carbs: 15 },
  oj: { name: "Orange juice", portion: "250 ml", carbs: 25 },
  oats: { name: "Porridge oats", portion: "60 g dry", carbs: 36 },
  banana: { name: "Banana", portion: "1 medium", carbs: 25 },
  rice: { name: "White rice", portion: "250 g cooked", carbs: 70 },
  pasta: { name: "White pasta", portion: "100 g dry", carbs: 72 },
  bread: { name: "White bread", portion: "2 slices", carbs: 30 },
  wrap: { name: "Tortilla wrap", portion: "1 large", carbs: 35 },
  potatoes: { name: "Potatoes, peeled", portion: "300 g", carbs: 50 },
  riceCakes: { name: "Rice cakes + jam", portion: "3 + 1 tbsp", carbs: 37 },
  sweets: { name: "Jelly sweets", portion: "50 g", carbs: 39 },
  drink: { name: "Sports drink", portion: "500 ml", carbs: 30 },
  pretzels: { name: "Pretzels", portion: "50 g", carbs: 38 },
  cereal: { name: "Rice cereal + milk", portion: "50 g + 200 ml", carbs: 52 },
  gel: { name: "Energy gel", portion: "1", carbs: 25 },
} satisfies Record<string, Food>;
type FoodKey = keyof typeof FOODS;

export interface Meal {
  name: string;
  target: number;
  foods: { food: Food; count: number }[];
  total: number;
}

export interface FuelStep {
  key: string;
  when: string;
  title: string;
  carbs: number | null;
  notes: string[];
  meals?: Meal[];
}

/**
 * Fills a meal towards its carb target: portions in turn while there's plenty left,
 * then whichever portion lands closest to the target.
 */
export function fillMeal(name: string, target: number, options: FoodKey[]): Meal {
  const counts = new Map<FoodKey, number>();
  const biggest = Math.max(...options.map((k) => FOODS[k].carbs));
  let total = 0;
  for (let i = 0; total < target - 10 && i < 40; i++) {
    const left = target - total;
    const k =
      left >= biggest
        ? options[i % options.length]
        : options.reduce((best, o) => (Math.abs(left - FOODS[o].carbs) < Math.abs(left - FOODS[best].carbs) ? o : best), options[0]);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    total += FOODS[k].carbs;
  }
  return { name, target: Math.round(target), foods: [...counts].map(([k, count]) => ({ food: FOODS[k], count })), total };
}

const MEALS: { name: string; share: number; options: FoodKey[] }[] = [
  { name: "Breakfast", share: 0.22, options: ["bagel", "jam", "oj", "banana"] },
  { name: "Snack", share: 0.1, options: ["riceCakes", "drink"] },
  { name: "Lunch", share: 0.24, options: ["rice", "wrap", "drink"] },
  { name: "Snack", share: 0.1, options: ["pretzels", "banana"] },
  { name: "Dinner", share: 0.26, options: ["pasta", "bread", "potatoes"] },
  { name: "Evening", share: 0.08, options: ["sweets", "cereal"] },
];

/** Breakfast size by how early the start is: a smaller, closer meal for an early wave. */
export function breakfastPlan(weight: number, startHour: number | null) {
  const early = startHour !== null && startHour < 9;
  const gPerKg = early ? 1 : 1.5;
  return { hoursBefore: early ? 2 : 3, carbs: Math.round((weight * gPerKg) / 5) * 5, gPerKg };
}

/**
 * The whole plan: two days out → day before (the load) → race morning → start line → during → after.
 * `loadGPerKg` is the day-before target (6–10; 8 suits most HYROX athletes).
 */
export function racePlan(weight: number, loadGPerKg: number, startTime: string | null, durationMin: number | null): FuelStep[] {
  const startHour = startTime ? Number(startTime.split(":")[0]) : null;
  const dayBefore = Math.round(weight * loadGPerKg);
  const twoOut = Math.round(weight * Math.min(6, loadGPerKg));
  const bf = breakfastPlan(weight, startHour);
  const long = (durationMin ?? 75) >= 60;
  const fmtStart = (hoursBefore: number) => {
    if (startHour === null || !startTime) return `${hoursBefore} h before your start`;
    const [h, m] = startTime.split(":").map(Number);
    const t = h * 60 + m - hoursBefore * 60;
    return `${String(Math.floor(((t + 1440) % 1440) / 60)).padStart(2, "0")}:${String(((t % 60) + 60) % 60).padStart(2, "0")} (${hoursBefore} h before)`;
  };

  return [
    {
      key: "d2",
      when: "2 days before",
      title: "Normal high-carb day",
      carbs: twoOut,
      notes: ["Carbs at every meal, as you would on a big training day.", "Last hard session should already be done; keep moving easily."],
    },
    {
      key: "d1",
      when: "Day before",
      title: `The carb load — ${loadGPerKg} g/kg`,
      carbs: dayBefore,
      notes: [
        "Spread it over 5–6 meals and snacks; no single huge meal.",
        "Go low-fibre and low-fat today (white over wholegrain, skip the big salad) — that's what makes the volume fit.",
        "Sip fluids all day; pale-yellow pee. A little extra salt is fine.",
        "Expect to be 0.5–1.5 kg heavier tomorrow: stored carbs hold water. That's fuel, not fat.",
      ],
      meals: MEALS.map((m) => fillMeal(m.name, dayBefore * m.share, m.options)),
    },
    {
      key: "bf",
      when: `Race morning · ${fmtStart(bf.hoursBefore)}`,
      title: `Breakfast — about ${bf.carbs} g carbs (${bf.gPerKg} g/kg)`,
      carbs: bf.carbs,
      notes: [
        "Something you've eaten before hard sessions — nothing new today.",
        `For example: ${fillMeal("", bf.carbs, ["bagel", "jam", "banana", "oj"]).foods.map((f) => `${f.count > 1 ? `${f.count} × ` : ""}${f.food.name.toLowerCase()}`).join(", ")}.`,
        `About ${Math.round((weight * 6) / 50) * 50} ml of fluid with it (5–7 ml per kg).`,
      ],
    },
    {
      key: "pre",
      when: "30–45 min before the start",
      title: "Top up — 20–30 g",
      carbs: 25,
      notes: ["A gel, a banana or a handful of jelly sweets, with a few sips of water.", "Caffeine if you normally use it: about 3 mg/kg, 45–60 min before."],
    },
    {
      key: "during",
      when: "During",
      title: long ? "Optional: one gel around halfway" : "Nothing needed",
      carbs: long ? 25 : null,
      notes: long
        ? ["After the row (station 5) is a natural point. Practise it in a sim first.", "Sips of water or sports drink in the Roxzone if it's hot."]
        : ["Your stores cover this. Sips of water in the Roxzone if it's hot."],
    },
    {
      key: "after",
      when: "Within an hour after",
      title: `Recover — ${Math.round(weight * 1)} g carbs + ${Math.round((weight * 0.3) / 5) * 5} g protein`,
      carbs: Math.round(weight * 1),
      notes: ["A proper meal soon after, then eat normally for 2–3 days before restarting any deficit."],
    },
  ];
}

/** Whole days and hours to go, from now to a race start. */
export function countdown(now: Date, start: Date): { days: number; hours: number; minutes: number; past: boolean } {
  const ms = start.getTime() - now.getTime();
  const abs = Math.max(0, ms);
  return { days: Math.floor(abs / 86400_000), hours: Math.floor((abs % 86400_000) / 3600_000), minutes: Math.floor((abs % 3600_000) / 60_000), past: ms <= 0 };
}
