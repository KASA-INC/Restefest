// Henter alle retter fra TheMealDB (https://www.themealdb.com) til én fil.
// Vilkår (themealdb.com/terms_of_use.php): innholdet kan kopieres og endres så lenge de offisielle
// endepunktene brukes, og TheMealDB skal krediteres. Testnøkkelen «1» er for utvikling; for en åpen side
// brukes supporter-nøkkelen i miljøvariabelen THEMEALDB_KEY.
//
//   node tools/hent-themealdb.mjs <ut-fil.json>
import fs from "node:fs";

const KEY = process.env.THEMEALDB_KEY || "1";
const out = process.argv[2] || "themealdb-raw.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const meals = new Map();
for (const letter of "abcdefghijklmnopqrstuvwxyz") {
  const res = await fetch(`https://www.themealdb.com/api/json/v1/${KEY}/search.php?f=${letter}`);
  const data = await res.json();
  for (const m of data.meals || []) meals.set(m.idMeal, m);
  await sleep(400);
}
fs.writeFileSync(out, JSON.stringify([...meals.values()]));
console.log(`${meals.size} retter → ${out}${KEY === "1" ? " (testnøkkel – sett THEMEALDB_KEY for en åpen side)" : ""}`);
