# Uka

Familiens uke på ett sted – handleliste, ukemeny og kalender – med sanntidssynk via **familiekode**.

- **I dag** (startskjerm): dagens middag, «Husk på» med dagens avtaler (pågående merket «nå», ferdige tonet ned), de fem øverste på handlelisten og et blikk på i morgen. Alt kan legges til og krysses av direkte herfra.
- **Handleliste** med to faner: *I butikk* og *Oda*. Trykk for å krysse av, «Fjern handlede» rydder.
- **Egne lister** (ønskelister o.l.) ved siden av *I butikk* og *Oda*: «+ Ny liste», gi nytt navn, slett. Lenker i en vare vises som en egen knapp.
- **Lyd ved avkrysning**: fem korte lyder (`public/sounds/`) spilles i tilfeldig rekkefølge når noe krysses av på listene – alle fem før noen gjentas, aldri samme to ganger på rad. Stillhet i starten er klippet bort og nivået utjevnet. Kan slås av per enhet i innstillingene.
- **Ikoner på avtaler**: velg blant 47 Arcticons-ikoner i sju grupper (sport, kultur, skole/jobb, helse, mat/sosialt, reise, hjem). Appen foreslår ikon ut fra tittelen («Tannlege» → tann) og husker ikonet fra sist. Listen ligger i `public/eventicons.js`.
- **Helligdager og merkedager** (røde dager, advent, sankthans, morsdag/farsdag, sommertid …) regnes ut for hvert år og vises i kalender, ukemeny og på startskjermen. Kan slås av i innstillingene.
- **Bursdager**: skriv «Ida 14.03.2015», «Kristian 090484» eller «Bursdag Ola 1. des» – gjentas hvert år og viser alder («Ida fyller 11») når fødselsåret er kjent.
- **Andre kalendere**: abonner på .ics-lenker (iCloud, Google, skole – og Spond via en egen iCloud-kalender). Avtalene vises i kalenderen, på startskjermen og i ukemenyen, merket med kilden. Serveren henter dem på nytt etter 10 minutter når appen brukes.
- **Autoutfylling**: forslag fra tidligere varer, retter (med oppskriftslenke) og avtaler (med klokkeslett) mens du skriver (mest brukte først, delt i familien). Trykk × på et forslag for å glemme det.
- **Kalender** med tre visninger – *Uke*, *Måned* (rutenett med prikker; trykk på en dag for detaljer) og *Kommende* (liste over de neste avtalene). Felles avtaler per uke (tittel, dato, fra–til-klokkeslett). Skriv avtaler på vanlig norsk i hurtigfeltet, f.eks. «Fotball tir og tor 17:30-19 hver uke i 3 mnd» – appen viser tolkningen før du lagrer. Trykk hvor som helst på en dag for å fylle ut skjema. Avtaler kan gjentas hver dag, hver uke eller annenhver uke (på valgte ukedager), hver måned eller hvert år – i 1, 3 eller 6 måneder, eller for alltid. Kan også abonneres på i iPhone-kalenderen (`webcal://…/cal/<kode>/kalender.ics`).
- **Ukemeny**: én kompakt rad per dag (hele uken på én skjerm) med rett og oppskriftsknapp – grå uten oppskrift (trykk for å legge til), grønn med (trykk for å åpne, hold inne for å endre). Lim en lenke rett inn i rettfeltet, så flyttes den til knappen. Mandag–søndag, med kalenderens avtaler i liten skrift. Viser inneværende uke mandag–torsdag og neste uke fra fredag kl. 00.00 (Oda-bestilling).
- **Abonnement**: ukemenyen kan også abonneres på i iPhone-kalenderen (`webcal://…/cal/<kode>.ics`).
- Familiekoden er et adjektiv + en matrett, f.eks. **Svett-Taco**. Store/små bokstaver og mellomrom spiller ingen rolle. Ingen innlogging; koden fungerer som passord, så del den bare med familien.

## Teknikk

Cloudflare Worker + Durable Object (én per familiekode) med WebSockets. Statisk frontend i `public/` uten byggesteg. Gratisplanen til Cloudflare holder godt.

## Kom i gang

```bash
npm install
npm run dev        # http://localhost:8787
```

## Publisering

```bash
npx wrangler login
npm run deploy     # oppdaterer workeren «handlelista» (https://uka-app.no)
```

Åpne adressen i Safari på iPhone → Del → **Legg til på Hjem-skjerm**.

## Deling (OpenGraph)

Forsiden har OpenGraph- og Twitter-metadata med tittel, beskrivelse og delingsbildet `public/og-image.png` (1200 × 630). Workeren gjør bilde- og side-adressene absolutte for domenet appen kjører på (`run_worker_first` i `wrangler.toml`), og familiekoden i invitasjonslenker tas ikke med i `og:url`.

## Varsler

Hver enhet kan slå på varsler under Innstillinger → Varsler, og velge hver type for seg:

- **Påminnelse før avtaler** (10 min – 2 timer før; også avtaler fra andre kalendere)
- **Morgenoversikt** med dagens avtaler, bursdager og middag (valgfritt klokkeslett)
- **Middag i dag** fra ukemenyen, med antall varer på handlelisten
- **Endringer fra familien**: nye varer og avtaler fra de *andre* enhetene, samlet i ett varsel etter halvannet minutt

Teknikk: standard Web Push uten eksterne tjenester. `public/sw.js` viser varslene. `src/push.js` krypterer (RFC 8291) og signerer (VAPID, RFC 8292). `src/notify.js` regner ut hva som skal sendes når, i norsk tid. Hver familie får sitt eget VAPID-nøkkelpar, laget første gang og lagret i familiens Durable Object sammen med abonnementene. En Durable Object-alarm vekker familien når neste varsel skal ut. Det trengs ingen hemmeligheter eller ekstra oppsett i Cloudflare.

På iPhone/iPad (iOS 16.4+) virker varsler bare når Uka er lagt på Hjem-skjermen.

## Frister fra Skatteetaten

Skatteetaten har ingen kalenderfil, men publiserer skattekalenderen som RSS. `src/skatt.js` gjør den om til en kalender på `/skatt.ics?k=person,enk,mva` (velg utvalg med `k`):

- `person`: skattemelding, skatteoppgjør, forskuddsskatt og skattekort
- `enk`: skattemelding og forskuddsskatt for enkeltpersonforetak
- `mva`: mva-melding (levering og betaling; ikke VOEC, omvendt avgiftsplikt eller kompensasjon)

Familier som vil ha fristene, legger adressen inn under Innstillinger → Andre kalendere. Da hentes fristene direkte fra Skatteetaten. Adressen kan også abonneres på i Kalender på iPhone. Skatteetaten legger bare ut inneværende års datoer, så faste frister føres ett år fram som «(forventet)» til de offisielle datoene er publisert.

## Profiler

Hver familie kan legge til profiler (maks 12) under profilknappen øverst til høyre. Det er ingen innlogging: hver enhet velger selv hvilken profil den bruker («Hvem er du?»), og man kan bytte fritt. Valget lagres bare på enheten. Profiler brukes til:

- **Private lister:** en egen liste kan gjøres «privat» for en profil. Da vises den bare på enheter som har valgt den profilen. Det er ment for ting som ikke er interessante for de andre, ikke for hemmeligheter. Slettes profilen, blir listene felles.
- **Navn i varsler:** «Ida la til på handlelisten: Melk og Egg».

Profilbildene er DiceBears «Lorelei» av Lisa Wischofsky (CC0) på lyse, varme bakgrunner. De hentes via `/api/avatar/lorelei/<frø>.svg`, som mellomlagres. Frøet er tilfeldig, så navn sendes aldri til DiceBear.

## Restefest

Fanen «Restefest» (mellom Lister og Ukemeny, og som egen side på `/restefest/`) finner oppskrifter som bruker restene dine. Restene skrives inn som merker (Enter eller komma). Søket skjer i nettleseren mot en egen oppskriftsbase (`public/restefest/oppskrifter.json`, ca. 5 200 oppskrifter) og mot familiens egne oppskrifter. Treffene sorteres etter hvor mange av restene de bruker, deretter etter hvor få ingredienser som mangler. Basisvarer (forhåndsutfylt, kan endres) regnes som noe man har. Fra hvert treff kan oppskriften legges i neste ukes ukemeny med lenke.

Ved siden av «Fra rester» har fanen «Finn oppskrift»: bla etter type rett (Middag, Suppe, Salat, Frokost og lunsj, Småretter, Bakst, Kaker og søtt, Dessert, Tilbehør og sauser, Drikke), hovedingrediens (Kylling, Kjøtt, Fisk, Vegetar) og tid (under 20 eller 40 min), sortert blandet (ny miks hver dag), raskest først eller A–Å, i et rutenett med bilder. Søkefeltet over leter i alle typer. Kildene merker oppskriftene ulikt, så typen og hovedingrediensen avledes i nettleseren fra tittel, kategorier og ingredienser (`public/restefest/kategorier.js`).

- **Oppskriftsbasen** bygges med `node tools/hent-oppskrifter.mjs <mappe>` og `node tools/bygg-oppskriftsbase.mjs <mappe>`. Den inneholder bare tittel, lenke, bilde, tid, kategori og ingredienser i grunnform. Kilder: REMA 1000, Coop og KIWI. Matprat, TINE og MENY er ikke med fordi vilkårene deres forbyr det; sjekk vilkårene før en ny kilde legges til.
- **Familiens oppskrifter:** når en oppskriftslenke legges i ukemenyen (eller limes inn i Restefest), leser serveren akkurat den siden og lagrer tittel, bilde og ingredienser i familien (`/api/recipes/<kode>`).
- **«Søk på Matprat»** åpner Matprats eget søk med restene.
- **TheMealDB (oversatt):** 790 internasjonale retter fra TheMealDB, oversatt til norsk med norske mål og ingredienser. Vises på vår egen side (`/restefest/oppskrift.html?id=…`) med kreditering av TheMealDB. Vilkårene deres tillater kopiering og endring via de offisielle endepunktene. Slik lages de (engangsjobb, krever `UKA_ANTHROPIC_KEY` og helst `THEMEALDB_KEY` som miljøvariabler – i Claude Code-skymiljøer er navnet `ANTHROPIC_API_KEY` reservert og når ikke frem til skriptene; koster ca. 40–60 dollar med Claude Opus):
  ```
  npm install
  node tools/hent-themealdb.mjs /tmp/themealdb-raw.json
  node tools/oversett-themealdb.mjs /tmp/themealdb-raw.json 3      # prøv 3 retter først og se over public/restefest/themealdb-no.json
  node tools/oversett-themealdb.mjs /tmp/themealdb-raw.json        # resten (kan avbrytes og kjøres igjen)
  node tools/bygg-oppskriftsbase.mjs /tmp/ingen-cache    # uten mellomlager beholdes REMA/Coop/KIWI fra eksisterende base
  ```
- **Wikibooks (oversatt):** inntil 700 oppskrifter fra den engelske [Wikibooks-kokeboka](https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents), oversatt til norsk på samme måte og vist på `/restefest/oppskrift.html?id=wb…`. Bare oppskrifter med fullstendige mengder og fremgangsmåte er tatt med (`tools/velg-wikibooks.mjs` sorterer, og modellen forkaster det som likevel er ufullstendig). Tekstene er lisensiert under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), og oversettelsene i `public/restefest/wikibooks-no.json` deles under samme lisens. Hver side krediterer originalen og bidragsyterne, og bildene krediteres med fotograf og lisens fra Wikimedia. Slik lages de:
  ```
  node tools/hent-wikibooks.mjs /tmp/wikibooks-raw.json
  node tools/velg-wikibooks.mjs /tmp/wikibooks-raw.json /tmp/wikibooks-utvalg.json 700
  node tools/oversett-wikibooks.mjs /tmp/wikibooks-utvalg.json 19   # stopper ved 19 dollar; kan kjøres igjen
  node tools/wikibooks-bildekreditt.mjs
  node tools/bygg-oppskriftsbase.mjs /tmp/ingen-cache
  ```
- `public/restefest/ingredienser.js` gjør ingredienslinjer om til grunnform og avgjør hva som passer sammen (sammensatte ord, samlebegreper som «ost» og «sopp», unntak som løk ≠ hvitløk).

## Vær

Under Innstillinger → Vær velger familien et sted, med søk i Kartverkets stedsnavn eller «Bruk min posisjon». Værvarselet fra Meteorologisk institutt (api.met.no, samme som Yr) vises på «I dag» (symbol, min./maks. og nedbør), i ukemenyen (symbol og makstemperatur) og i ukevisningen i kalenderen. `src/weather.js` henter varselet via workeren (`/api/weather`) med User-Agent og mellomlagring, slik MET krever, og lager én oversikt per dag med symbolet midt på dagen. Ikonene er Arcticons sine vær-emojier.

## Skrifter, farger og størrelser

Jost brukes overalt. Alle farger og mål i `public/style.css` kommer fra variabler øverst i fila:

- **Skrift:** 7 trinn – 11 (merkelapper), 12, 14, 16 (brødtekst og felt; 16 hindrer zoom i Safari), 18, 22, 28 px. Vekter 400/500/600.
- **Avstand:** 4, 8, 12, 16, 20, 24 px.
- **Hjørner:** 6, 10, 12, 16, 20 px og pille.
- **Kontrollhøyder:** 44 px (felt og hovedknapper), 36 px (segmentknapper, rett-felt, piller), 30 px (små ikonknapper).
- **Ikoner:** 22 og 16 px.

Trengs en ny verdi, vurder først om den kan bli et av trinnene.

**Farger («Pion»):** Blackberry, Meadow Flower, Pediment, Kurobeni og Copper Moon. Lys variant: lys Pediment-bakgrunn, Kurobeni-tekst og mørknet Meadow Flower som aksent. Mørk variant: Blackberry-bakgrunn, Pediment-tekst og lysnet Meadow Flower som aksent. Copper Moon brukes på tilkoblingsprikken og bursdager. Variablene står øverst i `style.css`.

## Logo og appikon

Uka-logoen (ordet UKA) ligger i `public/logo.svg`, og symbolet (haken) i `public/symbol.svg`. Begge er renset for Illustrator-data. Ordmerket brukes i appikonene – `icon-any-192/512.png` med Mac-formet avrundet flis og gjennomsiktig marg (Mac/Windows), `icon-192/512.png` som «maskable» fulle kvadrater (Android) og `icon-180.png` for iPhone –, i toppfeltet, på velkomstskjermen og i delingsbildet (`og-image.png`). Symbolet brukes der ordmerket blir for smått: faviconet (`icon.svg` og `favicon-32.png`) og varselikonet i statuslinjen på Android (`badge-96.png`).

## Ikoner

Ikonene er fra [Arcticons](https://github.com/Arcticons-Team/Arcticons) av Donnnno og Arcticons-bidragsytere, hentet via Iconify, og er lisensiert under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Brukt: `home`, `shopping-list`, `emoji-pot-of-food`, `nextcloud-cookbook`, `fossify-calendar`, `settings`, `share`, `trashcan`, `clock`, `emoji-birthday-cake`, `emoji-soccer-ball`, `emoji-anticlockwise-downwards-and-upwards-open-circle-arrows` og `heart`.

Endringer: strekbredden er justert for små størrelser og prikkene i kalenderikonet er forstørret. Pluss, kryss, piler, «åpne lenke» og «logg ut» finnes ikke i Arcticons og er tegnet i samme stil. Ikonene (med endringer) deles under samme lisens, CC BY-SA 4.0.
