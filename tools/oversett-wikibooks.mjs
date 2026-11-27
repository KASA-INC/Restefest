// Oversetter utvalgte Wikibooks-oppskrifter (fra tools/velg-wikibooks.mjs) til norsk med Claude og lagrer dem i
// public/restefest/wikibooks-no.json. Oversetter i rekkefølgen fra utvalget (best først) og stopper ved et
// kostnadstak. Kan avbrytes og kjøres igjen: ferdige retter hoppes over, og kostnaden lagres i fila.
// Innholdet er CC BY-SA 4.0 (Wikibooks-bidragsytere); oversettelsen deles under samme lisens.
// Krever UKA_ANTHROPIC_KEY (eller ANTHROPIC_API_KEY).
//
//   node tools/oversett-wikibooks.mjs <wikibooks-utvalg.json> [kostnadstak i dollar=19]
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const SRC = process.argv[2] || "wikibooks-utvalg.json";
const BUDGET = Number(process.argv[3] || 19);
const OUT = new URL("../public/restefest/wikibooks-no.json", import.meta.url);
const CONCURRENCY = Number(process.env.SAMTIDIG || 4);
const PRICE = { input: 4 / 1e6, output: 20 / 1e6 }; // Claude Opus 5.5, dollar per token

const apiKey = process.env.UKA_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("Mangler API-nøkkel: sett miljøvariabelen UKA_ANTHROPIC_KEY"); process.exit(1); }
const client = new Anthropic({ apiKey });
const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
const done = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8"))
  : { source: "Wikibooks Cookbook", license: "CC BY-SA 4.0", usage: { input: 0, output: 0 }, meals: {}, rejected: {} };
const cost = () => done.usage.input * PRICE.input + done.usage.output * PRICE.output;

const SYSTEM = `Du oversetter oppskrifter fra den engelske Wikibooks-kokeboka til naturlig norsk bokmål for en norsk familieapp.
- complete: sett false hvis oppskriften ikke kan lages slik den står – mengder mangler for viktige ingredienser, fremgangsmåten mangler viktige steg, eller teksten er uferdig, en spøk eller ikke en oppskrift. Ellers true.
- Tittel: bruk det norske navnet hvis retten har et etablert navn på norsk (f.eks. «Lasagne», «Fiskesuppe»). Ellers behold originalnavnet med en kort norsk forklaring i parentes bare hvis det er nødvendig for å forstå hva det er.
- Mengder: gjør om til norske mål. cup → dl (1 cup ≈ 2,4 dl, rund av fornuftig), tablespoon → ss, teaspoon → ts, oz → g (1 oz ≈ 28 g), lb → g (1 lb ≈ 450 g), pint → dl, quart → liter, stick butter → g (1 stick ≈ 115 g), °F → °C (rund av til nærmeste 5 eller 10). Står både amerikanske og metriske mål, bruk de metriske. Bruk desimalkomma. Skriv «stk» for antall der det passer.
- Ingredienser: bruk det navnet varen har i norske butikker (heavy cream → kremfløte, scallions → vårløk, ground beef → kjøttdeig, all-purpose flour → hvetemel, cilantro → frisk koriander, eggplant → aubergine, zucchini → squash). Er en vare vanskelig å få tak i i Norge, foreslå et vanlig alternativ i «note». Er ingredienslisten delt i deler (f.eks. [dough], [filling]), skriv delen først i «note» (f.eks. «Til fyllet»).
- Fremgangsmåte: del opp i tydelige, korte steg i riktig rekkefølge. Behold alle mengder, tider og temperaturer (i norske enheter). Ikke legg til eller fjern innhold, ikke finn på noe. Nyttige tips fra «Notes» kan tas med som siste steg, kort.
- minutes: anslått total tid i minutter ut fra fremgangsmåten. servings: antall porsjoner hvis det står eller er tydelig, ellers 4.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["complete", "title", "category", "area", "minutes", "servings", "ingredients", "steps"],
  properties: {
    complete: { type: "boolean" },
    title: { type: "string" },
    category: { type: "string", description: "Norsk kategori, f.eks. Middag, Dessert, Tilbehør, Frokost, Forrett, Bakst, Vegetar, Suppe, Saus" },
    area: { type: "string", description: "Kjøkkenet på norsk, f.eks. Italiensk, Syrisk, Amerikansk, Japansk; tom streng hvis ukjent" },
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

async function translate(r) {
  const text = [`Tittel: ${r.title}`, r.category && `Kategori: ${r.category}`, r.servings && `Porsjoner: ${r.servings}`, r.time && `Tid: ${r.time}`,
    "Ingredienser:", ...r.ingredients.map((l) => `- ${l}`), "Fremgangsmåte:", ...r.steps.map((s, i) => `${i + 1}. ${s}`),
    ...(r.notes.length ? ["Notes:", ...r.notes.map((n) => `- ${n}`)] : [])].filter(Boolean).join("\n");
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: text }],
  });
  done.usage.input += res.usage.input_tokens; done.usage.output += res.usage.output_tokens;
  if (res.stop_reason === "refusal") throw new Error("avslått");
  if (res.stop_reason === "max_tokens") throw new Error("for langt svar");
  const t = JSON.parse(res.content.find((b) => b.type === "text").text);
  if (!t.complete || t.ingredients.length < 3 || t.steps.length < 2) return null;
  return {
    id: `wb${r.id}`, title: t.title, category: t.category, area: t.area, minutes: t.minutes, servings: t.servings,
    ingredients: t.ingredients, steps: t.steps, image: r.image, source: r.url, original: r.title,
  };
}

const todo = src.filter((r) => !done.meals[`wb${r.id}`] && !done.rejected[`wb${r.id}`]);
console.log(`${Object.keys(done.meals).length} ferdige, ${todo.length} igjen, brukt $${cost().toFixed(2)} av $${BUDGET}`);
let n = 0, failed = 0, stopped = false;
const save = () => fs.writeFileSync(OUT, JSON.stringify(done));
async function worker() {
  while (todo.length) {
    if (cost() >= BUDGET) { stopped = true; return; }
    const r = todo.shift();
    try {
      const m = await translate(r);
      if (m) done.meals[m.id] = m; else done.rejected[`wb${r.id}`] = r.title;
    } catch (e) {
      failed++;
      if (e instanceof Anthropic.AuthenticationError) { save(); console.error("API-nøkkelen ble avvist (401)"); process.exit(1); }
      if (e instanceof Anthropic.RateLimitError) { todo.unshift(r); await new Promise((res) => setTimeout(res, 30000)); continue; }
      console.error(`Feil på «${r.title}»: ${e.message}`);
    }
    if (++n % 10 === 0) { save(); console.log(`${n} behandlet (${failed} feil), $${cost().toFixed(2)}`); }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
save();
console.log(`tokenbruk totalt: ${done.usage.input} inn, ${done.usage.output} ut = $${cost().toFixed(2)}${stopped ? " (stoppet ved kostnadstaket)" : ""}`);
console.log(`ferdig: ${Object.keys(done.meals).length} retter i wikibooks-no.json, ${Object.keys(done.rejected).length} forkastet som ufullstendige (${failed} feil)`);
