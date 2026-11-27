// Ingredienser i grunnform og sammenligning av rester mot oppskrifter.
// Brukes både når oppskriftsbasen bygges (node) og i appen (nettleseren).

const UNITS = "g|gr|gram|kilogram|kilo|potte|potter|desiliter|desiliteren|centiliter|milliliter|kg|hg|mg|dl|cl|ml|l|liter|ss|ts|spiseskje|spiseskjeer|teskje|teskjeer|stk|stykk|stykker|pk|pakke|pakker|boks|bokser|glass|beger|never|neve|klype|klyper|bunt|knippe|fedd|skive|skiver|kvast|kvaster|kvist|kvister|bit|biter|pose|poser|flaske|flasker|kopp|kopper|blad|stilk|stilker|porsjon|porsjoner|plate|plater|terning|terninger|båt|båter|dusk|dryss|skvett|kurv|kurver|rull|ruller|kartong|tube|stang|stenger|ark|filet|fileter|del|deler|håndfull|stor|store|liten|små|middels|ca|cirka";
const DESCRIPTORS = [
  "hakket", "hakkede", "finhakket", "grovhakket", "revne", "skivede", "kuttet", "kuttede", "revet", "finrevet", "grovrevet", "frisk", "friske", "fersk", "ferske", "kokt", "kokte",
  "stekt", "stekte", "skivet", "skåret", "strimlet", "renset", "skrelt", "smeltet", "myk", "myke", "kald", "kaldt", "kalde",
  "varm", "varmt", "lunken", "romtemperert", "ekstra", "gjerne", "evt", "eventuelt", "fint", "grovt", "tynt", "tynne", "tykke",
  "nykvernet", "kvernet", "malt", "tørket", "tørkede", "hermetisk", "hermetiske", "frossen", "frosne", "fryst", "frysetørket",
  "ferdigkokt", "ferdigkokte", "rå", "modne", "moden", "mør", "store", "stor", "små", "liten", "lite", "middels", "hele", "hel",
  "halv", "halve", "presset", "pressede", "ristet", "ristede", "saltet", "usaltet", "økologisk", "økologiske", "norsk", "norske",
  "sprø", "tint", "tinte", "oppskåret", "oppskårne", "delt", "delte", "knust", "knuste", "lett", "fint", "grov", "god", "gode",
];
// Merkenavn og «Coop Xtra»-ord som ikke sier noe om selve ingrediensen
const BRANDS = ["coop", "xtra", "x-tra", "rema", "rema 1000", "kiwi", "first price", "prior", "gilde", "tine", "q", "eldorado", "toro", "fjordland", "mills", "idun", "kavli", "santa maria", "old el paso", "rana", "barilla", "jacobs", "synnøve", "änglamark", "smak", "dagens", "folkets", "biola", "våre", "vår", "vårt", "favoritt", "favoritter"];
const brandRe = new RegExp(`(?<![\\p{L}])(?:${BRANDS.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}])`, "giu");
const DROP_AFTER = /\s(til|for|i|på|uten|med|etter|som|eller|à|á|a)\s.*$/; // «olje til steking», «i terninger», «eller …»
const IRREGULAR = {
  gulrøtter: "gulrot", gulrøtt: "gulrot", røtter: "rot", poteter: "potet", tomater: "tomat", epler: "eple", pærer: "pære",
  pastinakker: "pastinakk", bananer: "banan", sitroner: "sitron", limer: "lime", paprikaer: "paprika", champignoner: "sjampinjong", champignon: "sjampinjong", sjampinjonger: "sjampinjong", løker: "løk",
  agurker: "agurk", squasher: "squash", avokadoer: "avokado", reker: "reke", bønner: "bønne", erter: "ert", linser: "linse",
  nøtter: "nøtt", mandler: "mandel", oliven: "oliven", tortillalefser: "tortillalefse", tortillaer: "tortilla", pølser: "pølse",
  egget: "egg", eggene: "egg", eggeplommer: "eggeplomme", eggehviter: "eggehvite", skiver: "skive", fileter: "filet",
  kyllingfileter: "kyllingfilet", kyllinglår: "kyllinglår", vårløker: "vårløk", rødløker: "rødløk", hvitløksfedd: "hvitløk",
  kirsebærtomater: "cherrytomat", cherrytomater: "cherrytomat",
  // Ulike skrivemåter av samme ting
  avocado: "avokado", avocadoer: "avokado", chévre: "chevre", chèvre: "chevre", ruccula: "ruccola", rucola: "ruccola", rukkola: "ruccola",
  spagetti: "spaghetti", yogurt: "yoghurt", jogurt: "yoghurt", crème: "creme", créme: "creme", fraîche: "fraiche", squash: "squash",
  zucchini: "squash", courgette: "squash", koriander: "koriander", cilantro: "koriander", scampi: "reke", chili: "chili", chilli: "chili",
  mozarella: "mozzarella", parmesanost: "parmesan", parmigiano: "parmesan", bacon: "bacon", baconterninger: "bacon", plommer: "plomme", druer: "drue", jordbær: "jordbær",
};

const unitRe = new RegExp(`^(?:(?:${UNITS})\\.?\\s+)+`, "i");
const descRe = new RegExp(`(?<![\\p{L}])(?:${DESCRIPTORS.join("|")})(?![\\p{L}])`, "giu"); // \\b tåler ikke æøå

// Én ingredienslinje → én eller flere nøkler i grunnform («salt og pepper» → ["salt", "pepper"]).
export function keysFromLine(line) {
  let s = String(line).toLowerCase().normalize("NFC").replace(/\bundefined\b/g, " ") // feil i noen kilder
    .replace(/[îï]/g, "i").replace(/[éèêë]/g, "e").replace(/[àâá]/g, "a").replace(/[ôó]/g, "o").replace(/[ç]/g, "c").replace(/[ûúü]/g, "u");
  s = s.replace(/\([^)]*\)/g, " ").replace(/[«»"*]/g, " ");
  s = s.replace(/(\S+)-\s+eller\s+(\S+)/, "$2"); // «raps- eller olivenolje» → «olivenolje»
  s = s.split(/[,;:]/)[0];
  s = s.replace(/^[\s\d.,/½¼¾⅓⅔⅛–\-+]+(?:x\s*[\d.,]+[\s]*)?/, " ").trim(); // «2 x 100 g» → «g …», men «Xtra» beholdes
  s = s.replace(unitRe, "").trim();
  s = s.replace(/^[\s\d.,/½¼¾⅓⅔⅛–\-]+/, "").trim();
  s = s.replace(unitRe, "").trim();
  s = (" " + s).replace(DROP_AFTER, "").trim();
  return s.split(/\s+og\s+|\s*&\s*|\s*\/\s*/)
    .map((p) => p.replace(brandRe, " ").replace(/\s[\d.,]+\s*(?:g|kg|gr|ml|dl|l)\b.*$/, " ").replace(/\s(?:g|gr|kg|ml|dl|cl|l|stk)$/, " ").replace(descRe, " ").replace(/[^a-zæøåéèüö\- ]/g, " ").replace(/\s+/g, " ").trim())
    .map((p) => p.split(" ").map((w) => IRREGULAR[w] || w).join(" "))
    .filter((p) => p.length >= 2 && p.length <= 40);
}

// Brukerens egne ord: «Poteter» → «potet».
export const normQuery = (q) => (keysFromLine(q)[0] || "").trim();

const stem = (q) => (q.length > 4 ? q.replace(/(ene|er|ar|en|e)$/, "") : q);

// Passer resten `q` til ingrediensen `key`? Tåler sammensatte ord: «ris» → «basmatiris», «kylling» → «kyllingfilet».
// Ord som ser like ut, men er noe annet: løk ≠ hvitløk, mel ≠ melk.
const NOT = { løk: ["hvitløk", "hvitløksfedd", "gressløk", "purreløk", "vårløk"], kylling: ["kyllingbuljong", "kyllingkraft"], pasta: ["pastasaus"], tomat: ["tomatsaus", "tomatketchup", "tomatpure"], fisk: ["fiskebuljong", "fiskekraft", "fiskesaus"], kjøtt: ["kjøttbuljong", "kjøttkraft"], mel: ["melk", "melis"], ost: ["osteskjærer"], rom: ["romanosalat", "romano"], is: [] };
// Samlebegreper: «sopp» finner også sjampinjong, «ost» også parmesan osv.
const GROUPS = {
  sopp: ["sjampinjong", "kantarell", "portobello", "shiitake", "østerssopp", "skogsopp", "steinsopp", "trakt"],
  ost: ["parmesan", "mozzarella", "cheddar", "feta", "chevre", "norvegia", "jarlsberg", "gouda", "brie", "camembert", "halloumi", "ricotta", "mascarpone", "pecorino", "gruyere", "blåmugg", "gorgonzola", "manchego", "emmentaler", "snøfrisk", "cottage cheese", "kremost", "smøreost", "brunost", "geitost"],
  pasta: ["spaghetti", "tagliatelle", "penne", "fusilli", "makaroni", "lasagneplate", "linguine", "pappardelle", "farfalle", "rigatoni", "tortellini", "ravioli", "orzo", "gnocchi", "conchiglie", "fettuccine"],
  fisk: ["torsk", "laks", "sei", "hyse", "ørret", "kveite", "lyr", "makrell", "sild", "steinbit", "breiflabb", "tunfisk", "røye", "lange", "uer", "rødspette", "skrei"],
  kjøttdeig: ["karbonadedeig", "storfedeig", "svinedeig", "lammedeig", "kyllingdeig", "kyllingkjøttdeig"],
  kål: ["hvitkål", "rødkål", "grønnkål", "spisskål", "savoykål", "kinakål", "rosenkål", "blomkål", "brokkoli", "pak choi"],
  bær: ["jordbær", "bringebær", "blåbær", "tyttebær", "multe", "solbær", "rips", "bjørnebær", "tranebær"],
  nøtt: ["mandel", "hasselnøtt", "valnøtt", "cashew", "pistasj", "pekan", "peanøtt", "macadamia", "paranøtt"],
  brød: ["loff", "baguette", "ciabatta", "rundstykke", "pitabrød", "naan", "focaccia", "toast", "polarbrød", "lompe"],
  skinke: ["spekeskinke", "kokt skinke", "serranoskinke", "parmaskinke", "bacon"],
};
export function matches(q, key) {
  if (GROUPS[q] && GROUPS[q].some((g) => key.split(" ").some((w) => w.startsWith(g) || w.endsWith(g)) || key.includes(g))) return true;
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
export const isBasic = (key) => BASICS.includes(key) || BASICS.includes(key.split(" ").pop()) || /^(salt|pepper)\b/.test(key) || /buljong|kraftterning/.test(key);
