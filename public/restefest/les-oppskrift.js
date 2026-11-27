// Leser en oppskrifts strukturerte data (schema.org/Recipe i JSON-LD) fra en nettside.
// Brukes av innhentingsskriptet (tools/) og av serveren når familien legger inn en enkelt oppskriftslenke.
export function recipeFrom(html, url) {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    let d;
    try { d = JSON.parse(m[1]); } catch { continue; }
    const items = (Array.isArray(d) ? d : d["@graph"] || [d]).flatMap((x) => (x && x["@graph"] ? x["@graph"] : [x]));
    const r = items.find((x) => x && [].concat(x["@type"]).some((t) => String(t).includes("Recipe")));
    if (!r || !Array.isArray(r.recipeIngredient) || !r.recipeIngredient.length) continue;
    const img = Array.isArray(r.image) ? r.image[0] : r.image;
    return {
      url,
      title: String(r.name || "").replace(/\s+/g, " ").trim(),
      ingredients: r.recipeIngredient.map((s) => String(s).replace(/\s+/g, " ").trim()).filter(Boolean),
      image: typeof img === "string" ? img : img?.url || img?.contentUrl || "",
      time: r.totalTime || r.cookTime || "",
      category: [].concat(r.recipeCategory || []).map(String),
      yield: portions(r.recipeYield),
    };
  }
  return null;
}

// ISO 8601-varighet («PT1H30M») → minutter
export function minutes(iso) {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(iso || "");
  if (!m) return 0;
  const t = (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0);
  return t > 0 && t < 2880 ? t : 0;
}

// recipeYield («4 porsjoner», «Antall personer: 4», 4, ["4", "4 porsjoner"]) → antall porsjoner, eller 0
export function portions(y) {
  for (const v of [].concat(y ?? [])) {
    const m = /(\d+)/.exec(String(v));
    if (m && +m[1] > 0 && +m[1] <= 100) return +m[1];
  }
  return 0;
}
