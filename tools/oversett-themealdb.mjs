// Oversetter TheMealDB-retter til norsk med Claude, én rett om gangen, og lagrer dem i
// public/restefest/themealdb-no.json. Kan avbrytes og kjøres igjen: ferdige retter hoppes over.
// Krever UKA_ANTHROPIC_KEY (eller ANTHROPIC_API_KEY). Koster noen øre per rett (engangskostnad).
//
//   node tools/oversett-themealdb.mjs <themealdb-raw.json> [maks antall]
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const RAW = process.argv[2] || "themealdb-raw.json";
const MAX = Number(process.argv[3] || 1e9);
const OUT = new URL("../public/restefest/themealdb-no.json", import.meta.url);
const CONCURRENCY = Number(process.env.SAMTIDIG || 4);

// Nøkkelen: UKA_ANTHROPIC_KEY (anbefalt i skymiljøer, der ANTHROPIC_API_KEY er reservert for Claude Code) eller ANTHROPIC_API_KEY.
const apiKey = process.env.UKA_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("Mangler API-nøkkel: sett miljøvariabelen UKA_ANTHROPIC_KEY"); process.exit(1); }
const client = new Anthropic({ apiKey });
const raw = JSON.parse(fs.readFileSync(RAW, "utf8"));
const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { source: "TheMealDB", meals: {} };

const SYSTEM = `Du oversetter oppskrifter fra TheMealDB (engelsk) til naturlig norsk bokmål for en norsk familieapp.
- Tittel: bruk det norske navnet hvis retten har et etablert navn på norsk (f.eks. «Lasagne», «Fiskesuppe»). Ellers behold originalnavnet med en kort norsk forklaring i parentes bare hvis det er nødvendig for å forstå hva det er.
- Mengder: gjør om til norske mål. cup → dl (1 cup ≈ 2,4 dl, rund av fornuftig), tablespoon → ss, teaspoon → ts, oz → g (1 oz ≈ 28 g), lb → g (1 lb ≈ 450 g), pint → dl, stick butter → g (1 stick ≈ 115 g), °F → °C (rund av til nærmeste 5 eller 10). Bruk desimalkomma. Skriv «stk» for antall der det passer.
- Ingredienser: bruk det navnet varen har i norske butikker (heavy cream → kremfløte, scallions → vårløk, ground beef → kjøttdeig, all-purpose flour → hvetemel, cilantro → frisk koriander, eggplant → aubergine, zucchini → squash). Er en vare vanskelig å få tak i i Norge, foreslå et vanlig alternativ i «note».
- Fremgangsmåte: del opp i tydelige, korte steg i riktig rekkefølge. Behold alle mengder, tider og temperaturer (i norske enheter). Ikke legg til eller fjern innhold, ikke finn på noe.
- minutes: anslått total tid i minutter ut fra fremgangsmåten. servings: antall porsjoner hvis det står eller er tydelig, ellers 4.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "category", "area", "minutes", "servings", "ingredients", "steps"],
  properties: {
    title: { type: "string" },
    category: { type: "string", description: "Norsk kategori, f.eks. Middag, Dessert, Tilbehør, Frokost, Forrett, Bakst, Vegetar" },
    area: { type: "string", description: "Kjøkkenet på norsk, f.eks. Italiensk, Syrisk, Britisk, Japansk" },
    minutes: { type: "integer" },
    servings: { type: "integer" },
    ingredients: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["amount", "item", "note"],
        properties: { amount: { type: "string" }, item: { type: "string" }, note: { type: "string" } },
      },
    },
    steps: { type: "array", items: { type: "string" } },
  },
};

const ingredientsOf = (m) => Array.from({ length: 20 }, (_, i) => [m[`strMeasure${i + 1}`], m[`strIngredient${i + 1}`]])
  .filter(([, ing]) => ing && ing.trim()).map(([mea, ing]) => `${(mea || "").trim()} ${ing.trim()}`.trim());

async function translate(m) {
  const text = [`Tittel: ${m.strMeal}`, `Kategori: ${m.strCategory}`, `Kjøkken: ${m.strArea}`, "Ingredienser:", ...ingredientsOf(m).map((l) => `- ${l}`), "Fremgangsmåte:", m.strInstructions].join("\n");
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: text }],
  });
  usage.input += res.usage.input_tokens; usage.output += res.usage.output_tokens; usage.n++;
  if (res.stop_reason === "refusal") throw new Error("avslått");
  if (res.stop_reason === "max_tokens") throw new Error("for langt svar");
  const block = res.content.find((b) => b.type === "text");
  const t = JSON.parse(block.text);
  return {
    id: m.idMeal, title: t.title, category: t.category, area: t.area, minutes: t.minutes, servings: t.servings,
    ingredients: t.ingredients, steps: t.steps, image: m.strMealThumb, source: m.strSource || "", original: m.strMeal,
  };
}

const todo = raw.filter((m) => !done.meals[m.idMeal]).slice(0, MAX);
console.log(`${Object.keys(done.meals).length} ferdige, ${todo.length} igjen`);
let n = 0, failed = 0;
const usage = { input: 0, output: 0, n: 0 };
const save = () => fs.writeFileSync(OUT, JSON.stringify(done));
async function worker() {
  while (todo.length) {
    const m = todo.shift();
    try {
      done.meals[m.idMeal] = await translate(m);
    } catch (e) {
      failed++;
      if (e instanceof Anthropic.AuthenticationError) { console.error("API-nøkkelen ble avvist (401)"); process.exit(1); }
      if (e instanceof Anthropic.RateLimitError) { todo.push(m); await new Promise((r) => setTimeout(r, 30000)); continue; }
      console.error(`Feil på «${m.strMeal}»: ${e.message}`);
    }
    if (++n % 10 === 0) { save(); console.log(`${n} oversatt (${failed} feil)`); }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
save();
console.log(`tokenbruk: ${usage.input} inn, ${usage.output} ut over ${usage.n} kall`);
console.log(`ferdig: ${Object.keys(done.meals).length} retter i themealdb-no.json (${failed} feil)`);
