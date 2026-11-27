// Sorterer oppskrifter i type rett og hovedingrediens ut fra tittel, kategorier og ingredienser.
// Kildene merker oppskriftene ulikt (KIWI har ingen kategorier), så vi lager vår egen, enkle inndeling.

export const TYPES = [
  ["middag", "Middag"],
  ["suppe", "Suppe"],
  ["salat", "Salat"],
  ["frokost", "Frokost og lunsj"],
  ["smaratt", "Småretter"],
  ["bakst", "Bakst"],
  ["kaker", "Kaker og søtt"],
  ["dessert", "Dessert"],
  ["tilbehor", "Tilbehør og sauser"],
  ["drikke", "Drikke"],
];
export const MAINS = [
  ["kylling", "Kylling"],
  ["kjott", "Kjøtt"],
  ["fisk", "Fisk"],
  ["vegetar", "Vegetar"],
];
// Hovedingrediens gir bare mening for mat-typene, ikke for kaker og drikke.
export const HAS_MAIN = new Set(["middag", "suppe", "salat", "frokost", "smaratt"]);

const low = (t) => String(t || "").toLowerCase();
const rx = (words) => new RegExp(`(${words})`);

const T = {
  drikke: rx("drikke|smoothie(?!.?bowl)|gløgg|kakao|varm sjokolade|\\bsaft\\b|limonade|\\biste\\b|milkshake|\\blassi|punsj|mocktail|(?<!reke)cocktail|mojito|lemonade|espresso|cooler|slush|daiquiri|granité|juice|latte|kaffe\\b|eggelikør"),
  kaker: rx("(?<!kjøtt|fiske|fisk|potet|skrei|panne|reke|krabbe|laks|grønnsak|torske|torsk|kylling|bønne|linse|ris|mais|hamburger|burger|sei|hyse|ost|lappe)kake|muffin|brownie|cupcake|cookie|småkake|kjeks|marengs|pavlova|konfekt|fudge|trøffel|sjokoladebit|kransekake|sirupsnipp|krumkake|goro|berlinerkrans|serinakake|sandkake|lussekatt|donut|smultring|macaron|biscotti|karamell(?!saus)|blondie|bløtkake|rulade|terte|toscakake"),
  bakst: rx("(?<!smør|smørre)brød|(?<!kjøtt|fiske|kylling|ris|kjøttdeig)bolle|rundstykke|scones|focaccia|pizzadeig|pizzabunn|lompe|lefse|vaffel|vafler|baguette|ciabatta|knekkebrød|kanelsnurr|kanelbolle|skolebrød|croissant|loff|flatbrød|naan|surdeig|pitabrød|horn\\b|pai-?deig|grissini|rosinbolle|kringle|wienerbrød"),
  dessert: rx("dessert|\\bis\\b|iskrem|sorbet|pudding|mousse|fromasj|panna cotta|tiramisu|crumble|smuldrepai|trifle|parfait|suffl|riskrem|tilslørte|crème brûlée|creme brulee|semifreddo|eplepai|bringebærpai|fruktsalat|bananasplit|pannacotta|sjokoladefondant|clafoutis"),
  frokost: rx("frokost|grøt|granola|müsli|musli|omelett|eggerøre|overnight|chiapudding|yoghurt(?!marinert)|toast|sandwich|smørbrød|panini|brunch|bagel|matpakke|lunsj|avokado på|eggs benedict|french toast|arme riddere|smoothiebowl|smoothie bowl|frittata|shakshuka|croque"),
  suppe: rx("suppe|gazpacho|chowder|ramen|\\bpho\\b|bisque|minestrone|borsjtsj|sodd\\b|laksa"),
  salat: rx("salat|coleslaw|poke ?bowl|tabbouleh"),
  tilbehor: rx("saus|dressing|dipp|\\bdip\\b|salsa|pesto|aioli|majones|chutney|relish|syltetøy|marmelade|sylteagurk|potetmos|ovnspoteter|stekte poteter|potetbåter|pommes|rotmos|kålstuing|ertestuing|hummus|guacamole|tzatziki|smør med|urtesmør|krydderblanding|marinade|ris\\b|couscous|bulgur|sylte\\b|kompott|gele\\b|glasur|topping|puré|krem\\b|kremfløte"),
  smaratt: rx("tapas|snacks|(?<!fish and |fish & |fisk og )chips|nachos|popcorn|fingermat|spyd|bruschetta|crostini|canapé|vårrull|dumpling|gyoza|samosa|empanada|quesadilla|pinnemat|forrett|deviled|fylte egg|ostefat|sushi|blinis|tartelett|pigs in"),
};
const CAT = {
  drikke: /drikke|alkoholfri|smoothie|gløgg|kakao|kaffe/,
  kaker: /kaker|småkaker|konfekt|søt bakst|brownies|muffins|ostekaker|kremkaker|sjokoladekake|pavlova|dessert og bakst/,
  bakst: /bakst|brød|boller|rundstykker|vaffel/,
  dessert: /dessert|is$|fromasj|pai/,
  frokost: /frokost|grøt|toast og sandwich|lunsj|brunch|matpakke/,
  suppe: /suppe/,
  salat: /salat/,
  tilbehor: /tilbehør|saus|dressing|syltetøy/,
  smaratt: /tapas|snacks|forrett|småretter/,
};

// Ingrediensene sjekkes én og én fra starten av ordet, så «fiskesaus» i en curry ikke gjør retten til fisk.
const FISK_KEY = /^(laks|torsk|sei$|hyse|ørret|makrell|sild|tunfisk|reke|scampi|kveite|skrei|fiskekake|fiskebolle|fiskepudding|fiskefilet|fiskepinne|hvit fisk|blåskjell|krabbe|kamskjell|breiflabb|røye|steinbit|hummer|kreps|lyr$|rødspette|sjøkreps|østers|blekksprut|tilapia|pangasius|skalldyr|surimi|sjømat|torskerogn|klippfisk|lutefisk|fisk$)/;
const KYLLING_KEY = /^(kylling|kalkun|høne|and$|andebryst|andelår|andeconfit)/;
const KJOTT_KEY = /^(kjøttdeig|kjøtt|storfe|biff|entrecote|svin|bacon|skinke|spekeskinke|pølse|lam$|lammekjøtt|lammelår|lammeskank|lammekotelett|lammestek|fårikål|vilt|elg|hjort|reinsdyr|rein$|karbonade|ribbe|pinnekjøtt|chorizo|salami|okse|kalv|indrefilet|mørbrad|kotelett|flesk|kebab|hamburger|spekemat|pancetta|prosciutto|serrano|kjøttbolle|kjøttkake|grillpølse|wienerpølse|medisterkake|medister|lammefilet|svinefilet|ytrefilet|høyrygg|bogstek|lårstek|kjøttpølse|kalkunpølse|pepperoni|lever|bresaola|guanciale)/;
const FISK = /laks|torsk|sei\b|hyse|ørret|makrell|sild|tunfisk|reke|scampi|kveite|skrei|fiskekake|fiskebolle|fiskepudding|blåskjell|krabbe|kamskjell|breiflabb|røye|steinbit|fisk|sjømat|hummer|kreps|lyr|uer|rødspette|sjøkreps|østers|ansjos|blekksprut|tilapia|pangasius|skalldyr|surimi|kaviar/;
const KYLLING = /kylling|kalkun|\bhøne|andebryst|andelår/;
const KJOTT = /kjøttdeig|kjøtt|storfe|biff|entrecote|svin|bacon|skinke|pølse|lam\b|lammekjøtt|lammelår|lammeskank|lammekotelett|fårikål|får\b|vilt|elg|hjort|reinsdyr|rein\b|karbonade|ribbe|pinnekjøtt|chorizo|salami|okse|kalv|indrefilet|mørbrad|kotelett|nakke|svor|flesk|kebab|hamburger|burger|lammestek|stek\b|spekemat|pancetta|prosciutto|chili con carne|bolognese|kjøttbolle|kjøttkake/;

const first = (title) => low(title).split(/\s+(?:med|og|i|på|til|fra|uten)\s+|,|\(|–|—|:/)[0];

export function typeOf(title, cats, keys) {
  const t = low(title);
  const f = first(title);
  const c = (cats || []).map(low).join("|");
  // Hovedordet (før «med», «og» …) avgjør: «Laks med sitronsaus» er middag, «Tacosalat med bønner» er salat.
  // Kaker, dessert, bakst og drikke kan ikke ha kjøtt eller fisk i navnet («Medisterkaker», «Pai med laks»).
  const savory = FISK.test(t) || KJOTT.test(t) || KYLLING.test(t);
  const ok = (k) => !(savory && (k === "kaker" || k === "dessert" || k === "drikke" || k === "bakst"));
  const ORDER = ["drikke", "kaker", "dessert", "bakst", "suppe", "salat", "frokost", "smaratt", "tilbehor"];
  for (const k of ORDER) if (T[k].test(f) && ok(k)) return k;
  if (!savory && T.drikke.test(t)) return "drikke";
  if (!savory && /topping|puré$/.test(t)) return "tilbehor";
  for (const k of ORDER) if (CAT[k].test(c) && ok(k)) return k;
  // Søtt uten tydelig ord i tittelen: mye sukker og mel, ingen kjøtt eller fisk → kaker.
  const ks = (keys || []).join(" ");
  const plain = !(keys || []).some((k) => FISK_KEY.test(low(k)) || KYLLING_KEY.test(low(k)) || KJOTT_KEY.test(low(k)));
  if (/sukker|melis/.test(ks) && /hvetemel|bakepulver|natron|gjær/.test(ks) && plain) return /gjær/.test(ks) ? "bakst" : "kaker";
  if (/(pannekake|lapper|sveler)/.test(t) && plain && !FISK.test(t) && !KJOTT.test(t) && !KYLLING.test(t)) return "frokost";
  return "middag";
}

export function mainOf(title, keys) {
  const t = low(title);
  const ks = (keys || []).join(" ");
  // Tittelen først («Kyllingsalat»), så ingrediensene.
  if (KYLLING.test(t)) return "kylling";
  if (FISK.test(t)) return "fisk";
  if (KJOTT.test(t)) return "kjott";
  const has = (re) => (keys || []).some((k) => re.test(low(k)));
  if (has(KYLLING_KEY)) return "kylling";
  if (has(FISK_KEY)) return "fisk";
  if (has(KJOTT_KEY)) return "kjott";
  return "vegetar";
}

// r = [tittel, lenke, kilde, bilde, minutter, kategorier, ingredienser, …]
export function classify(r) {
  return { type: typeOf(r[0], r[5], r[6]), main: mainOf(r[0], r[6]) };
}
