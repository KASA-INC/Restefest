// Ikoner man kan velge for avtaler (Arcticons). `id` er navnet på symbolet i ikonsamlingen
// (#i-<id> i index.html), `words` brukes til å foreslå ikon ut fra tittelen.
export const EVENT_ICON_GROUPS = [
  ["Sport og friluft", [
    ["football", "Fotball", "fotball fotballtrening kamp seriekamp cup"],
    ["basketball", "Basket", "basket basketball"],
    ["tennis", "Tennis", "tennis padel badminton"],
    ["volleyball", "Volleyball", "volleyball sandvolleyball"],
    ["bicycle", "Sykkel", "sykkel sykling sykkeltur spinning"],
    ["hiking-boot", "Tur", "tur fjelltur gåtur skogstur turmarsj"],
    ["snowflake", "Vinter og ski", "ski skitur skirenn slalåm skøyter vinter aking"],
    ["evergreen-tree", "Natur", "skog natur hytte hyttetur telttur speidern speider"],
  ]],
  ["Musikk og kultur", [
    ["musical-keyboard", "Piano", "piano pianotime keyboard"],
    ["musical-note", "Musikk", "musikk korps kor sang konsert øving gitar gitartime kulturskole"],
    ["artist-palette", "Kunst", "kunst maling tegning forming"],
    ["clapper-board", "Film", "kino film"],
    ["admission-tickets", "Billetter", "billett billetter"],
    ["circus-tent", "Forestilling", "teater forestilling sirkus show revy"],
  ]],
  ["Skole og jobb", [
    ["school", "Skole", "skole skolestart foreldremøte utviklingssamtale konferansetime eksamen avslutning"],
    ["books", "Lekser", "lekser lesing bibliotek prøve"],
    ["briefcase", "Jobb", "jobb arbeid kontor reise jobbreise"],
    ["desktop-computer", "Data", "data pc teams zoom webinar"],
    ["busts-in-silhouette", "Møte", "møte samtale styremøte dugnad"],
  ]],
  ["Helse", [
    ["tooth", "Tannlege", "tannlege tannregulering kjeveortoped"],
    ["adhesive-bandage", "Lege", "lege legetime helsestasjon fysio fysioterapeut sykehus kontroll"],
    ["pill", "Medisin", "medisin apotek"],
    ["syringe", "Vaksine", "vaksine vaksinering blodprøve"],
    ["barber-pole", "Frisør", "frisør hårklipp klipp"],
  ]],
  ["Mat og sosialt", [
    ["pot-of-food", "Middag", "middag lunsj frokost mat"],
    ["coffee", "Kaffe", "kaffe kaffebesøk"],
    ["pizza", "Pizza", "pizza fredagspizza"],
    ["clinking-glasses", "Skål", "skål vin middagsselskap julebord"],
    ["party-popper", "Fest", "fest feiring jubileum nyttår"],
    ["balloon", "Selskap", "selskap barnebursdag bursdagsselskap"],
    ["church", "Kirke", "kirke konfirmasjon dåp bryllup gudstjeneste begravelse"],
  ]],
  ["Reise", [
    ["airplane", "Fly", "fly flytur flyplass gardermoen"],
    ["car", "Bil", "bil verksted eu-kontroll dekkskift bilvask"],
    ["bus", "Buss", "buss tog ferje"],
    ["beach-with-umbrella", "Ferie", "ferie sommerferie strand syden"],
  ]],
  ["Hjem og familie", [
    ["broom", "Rengjøring", "vask rengjøring rydde rydding husvask"],
    ["hammer-and-wrench", "Fikse", "fikse reparere snekker rørlegger elektriker håndverker"],
    ["potted-plant", "Hage", "hage plante planting gressklipp"],
    ["basket", "Handle", "handle handletur butikk innkjøp"],
    ["bed", "Overnatting", "overnatting sove sovetur"],
    ["dog", "Hund", "hund hundetur veterinær valpekurs"],
    ["cat", "Katt", "katt"],
    ["baby", "Baby", "baby barnehage babysang"],
    ["heart", "Kjæreste", "kjæreste date bryllupsdag"],
    ["bell", "Påminnelse", "husk påminnelse frist betale"],
    ["video-game", "Spill", "spill gaming spillkveld"],
    ["camera", "Foto", "foto fotografering bilder"],
    ["phone", "Ring", "ring ringe telefon"],
  ]],
];

export const EVENT_ICONS = EVENT_ICON_GROUPS.flatMap(([, list]) => list.map(([id, label, words]) => ({ id, label, words: words.split(" ") })));
export const EVENT_ICON_IDS = new Set(EVENT_ICONS.map((i) => i.id));

// Foreslår ikon ut fra en tittel: et ord i tittelen som starter med (eller er) et nøkkelord.
export function suggestIcon(title) {
  const words = title.toLowerCase().split(/[^\p{L}\d-]+/u).filter(Boolean);
  for (const ic of EVENT_ICONS) {
    for (const k of ic.words) {
      if (words.some((w) => w === k || (k.length >= 4 && w.startsWith(k)))) return ic.id;
    }
  }
  return "";
}
