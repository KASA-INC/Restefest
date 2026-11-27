// Ingredienser i grunnform og sammenligning av rester mot oppskrifter.
// Brukes både når oppskriftsbasen bygges (node) og i appen (nettleseren).

const UNITS = "g|gr|gram|kg|hg|mg|dl|cl|ml|l|liter|ss|ts|spiseskje|spiseskjeer|teskje|teskjeer|stk|stykk|stykker|pk|pakke|pakker|boks|bokser|glass|beger|never|neve|klype|klyper|bunt|knippe|fedd|skive|skiver|kvast|kvaster|bit|biter|pose|poser|flaske|flasker|kopp|kopper|blad|stilk|stilker|porsjon|porsjoner|plate|plater|terning|terninger|båt|båter|dusk|dryss|skvett|kurv|kurver|rull|ruller|kartong|tube|stang|stenger|ark|filet|fileter|del|deler|håndfull|stor|store|liten|små|middels|ca|cirka";
const DESCRIPTORS = [
  "hakket", "hakkede", "finhakket", "grovhakket", "revne", "skivede", "kuttet", "kuttede", "revet", "finrevet", "grovrevet", "frisk", "friske", "fersk", "ferske", "kokt", "kokte",
  "stekt", "stekte", "skivet", "skåret", "strimlet", "renset", "skrelt", "smeltet", "myk", "myke", "kald", "kaldt", "kalde",
  "varm", "varmt", "lunken", "romtemperert", "ekstra", "gjerne", "evt", "eventuelt", "fint", "grovt", "tynt", "tynne", "tykke",
  "nykvernet", "kvernet", "malt", "tørket", "tørkede", "hermetisk", "hermetiske", "frossen", "frosne", "fryst", "frysetørket",
  "ferdigkokt", "ferdigkokte", "rå", "modne", "moden", "mør", "store", "stor", "små", "liten", "lite", "middels", "hele", "hel",
  "halv", "halve", "presset", "pressede", "ristet", "ristede", "saltet", "usaltet", "økologisk", "økologiske", "norsk", "norske",
  "sprø", "tint", "tinte", "oppskåret", "oppskårne", "delt", "delte", "knust", "knuste", "lett", "fint", "grov", "god", "gode",
];
const DROP_AFTER = /\s(til|for|i|på|uten|med|etter|som|eller|à|á|a)\s.*$/; // «olje til steking», «i terninger», «eller …»
const IRREGULAR = {
  gulrøtter: "gulrot", gulrøtt: "gulrot", røtter: "rot", poteter: "potet", tomater: "tomat", epler: "eple", pærer: "pære",
  bananer: "banan", sitroner: "sitron", limer: "lime", paprikaer: "paprika", champignoner: "champignon", løker: "løk",
  agurker: "agurk", squasher: "squash", avokadoer: "avokado", reker: "reke", bønner: "bønne", erter: "ert", linser: "linse",
  nøtter: "nøtt", mandler: "mandel", oliven: "oliven", tortillalefser: "tortillalefse", tortillaer: "tortilla", pølser: "pølse",
  egget: "egg", eggene: "egg", eggeplommer: "eggeplomme", eggehviter: "eggehvite", skiver: "skive", fileter: "filet",
  kyllingfileter: "kyllingfilet", kyllinglår: "kyllinglår", vårløker: "vårløk", rødløker: "rødløk", hvitløksfedd: "hvitløk",
  kirsebærtomater: "cherrytomat", cherrytomater: "cherrytomat", plommer: "plomme", druer: "drue", jordbær: "jordbær",
};

const unitRe = new RegExp(`^(?:(?:${UNITS})\\.?\\s+)+`, "i");
const descRe = new RegExp(`(?<![\\p{L}])(?:${DESCRIPTORS.join("|")})(?![\\p{L}])`, "giu"); // \\b tåler ikke æøå

// Én ingredienslinje → én eller flere nøkler i grunnform («salt og pepper» → ["salt", "pepper"]).
export function keysFromLine(line) {
  let s = String(line).toLowerCase().normalize("NFC");
  s = s.replace(/\([^)]*\)/g, " ").replace(/[«»"*]/g, " ");
  s = s.replace(/(\S+)-\s+eller\s+(\S+)/, "$2"); // «raps- eller olivenolje» → «olivenolje»
  s = s.split(/[,;:]/)[0];
  s = s.replace(/^[\s\d.,/½¼¾⅓⅔⅛–\-x+]+/, " ").trim();
  s = s.replace(unitRe, "").trim();
  s = s.replace(/^[\s\d.,/½¼¾⅓⅔⅛–\-]+/, "").trim();
  s = s.replace(unitRe, "").trim();
  s = (" " + s).replace(DROP_AFTER, "").trim();
  return s.split(/\s+og\s+|\s*&\s*|\s*\/\s*/)
    .map((p) => p.replace(descRe, " ").replace(/[^a-zæøåéèüö\- ]/g, " ").replace(/\s+/g, " ").trim())
    .map((p) => p.split(" ").map((w) => IRREGULAR[w] || w).join(" "))
    .filter((p) => p.length >= 2 && p.length <= 40);
}

// Brukerens egne ord: «Poteter» → «potet».
export const normQuery = (q) => (keysFromLine(q)[0] || "").trim();

const stem = (q) => (q.length > 4 ? q.replace(/(ene|er|ar|en|e)$/, "") : q);

// Passer resten `q` til ingrediensen `key`? Tåler sammensatte ord: «ris» → «basmatiris», «kylling» → «kyllingfilet».
// Ord som ser like ut, men er noe annet: løk ≠ hvitløk, mel ≠ melk.
const NOT = { løk: ["hvitløk", "hvitløksfedd"], mel: ["melk", "melis"], ost: ["osteskjærer"], rom: ["romanosalat", "romano"], is: [] };
export function matches(q, key) {
  if (!q || q.length < 2) return false;
  if (key === q) return true;
  const qs = stem(q);
  for (const w of key.split(" ")) {
    if (w === q || w === qs) return true;
    if (NOT[q]?.some((x) => w.startsWith(x))) continue;
    if (q.length >= 3 && (w.startsWith(qs) || w.endsWith(q) || (qs.length >= 3 && w.endsWith(qs)))) return true;
  }
  return false;
}

// Basisvarer de fleste har: regnes som «har» når brukeren slår det på. Sammenlignes mot siste ord i nøkkelen,
// så «sort pepper» er basis, men «chilipepper» ikke.
export const BASICS = ["salt", "flaksalt", "havsalt", "pepper", "olje", "olivenolje", "rapsolje", "nøytral olje", "smør", "margarin", "vann", "sukker", "hvetemel", "mel", "melis", "eddik", "buljong", "buljongterning"];
export const isBasic = (key) => BASICS.includes(key) || BASICS.includes(key.split(" ").pop()) || /^(salt|pepper)\b/.test(key);
