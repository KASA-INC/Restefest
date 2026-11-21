# Uka

Familiens uke på ett sted – handleliste, ukemeny og kalender – med sanntidssynk via **familiekode**.

- **I dag** (startskjerm): dagens middag, «Husk på» med dagens avtaler (pågående merket «nå», ferdige tonet ned), de fem øverste på handlelisten og et blikk på i morgen. Alt kan legges til og krysses av direkte herfra.
- **Handleliste** med to faner: *I butikk* og *Oda*. Trykk for å krysse av, «Fjern handlede» rydder.
- **Egne lister** (ønskelister o.l.) ved siden av *I butikk* og *Oda*: «+ Ny liste», gi nytt navn, slett. Lenker i en vare vises som en egen knapp.
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
npm run deploy     # gir en adresse som https://uka.<konto>.workers.dev
```

Åpne adressen i Safari på iPhone → Del → **Legg til på Hjem-skjerm**.

## Deling (OpenGraph)

Forsiden har OpenGraph- og Twitter-metadata med tittel, beskrivelse og delingsbildet `public/og-image.png` (1200 × 630). Workeren gjør bilde- og side-adressene absolutte for domenet appen kjører på (`run_worker_first` i `wrangler.toml`), og familiekoden i invitasjonslenker tas ikke med i `og:url`.

## Skrifter og farger

Varm palett (krem, espresso, terrakotta) med egen mørk modus. Skriftene ligger i `public/fonts/` og lastes ikke fra nett. Nå brukes [Jost](https://github.com/indestructible-type/Jost) (geometrisk sans i Futura-tradisjonen) overalt; serifskriftene kan slås på igjen med tre CSS-variabler øverst i `style.css`: [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant) (de største titlene), [Fraunces](https://github.com/undercasetype/Fraunces) (overskrifter) og [Lora](https://github.com/cyrealtype/Lora-Cyrillic) (tekst), begge under SIL Open Font License, hentet via Fontsource.

## Ikoner

Ikonene er fra [Arcticons](https://github.com/Arcticons-Team/Arcticons) av Donnnno og Arcticons-bidragsytere, hentet via Iconify, og er lisensiert under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Brukt: `home`, `shopping-list`, `emoji-pot-of-food`, `nextcloud-cookbook`, `fossify-calendar`, `settings`, `share`, `trashcan`, `clock`, `emoji-birthday-cake`, `emoji-soccer-ball`, `emoji-anticlockwise-downwards-and-upwards-open-circle-arrows` og `heart`.

Endringer: strekbredden er justert for små størrelser, prikkene i kalenderikonet er forstørret, og appikonet er satt sammen av `fossify-calendar` og `heart`. Pluss, kryss, piler, «åpne lenke» og «logg ut» finnes ikke i Arcticons og er tegnet i samme stil. Ikonene (med endringer) deles under samme lisens, CC BY-SA 4.0.
