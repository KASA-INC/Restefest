# Uka

Familiens uke på ett sted – handleliste, ukemeny og kalender – med sanntidssynk via **familiekode**.

- **I dag** (startskjerm): dagens middag, dagens aktiviteter (pågående merket «nå», ferdige tonet ned), de fem øverste på handlelisten og et blikk på i morgen. Alt kan legges til og krysses av direkte herfra.
- **Handleliste** med to faner: *I butikk* og *Oda*. Trykk for å krysse av, «Fjern handlede» rydder.
- **Egne lister** (ønskelister o.l.) ved siden av *I butikk* og *Oda*: «+ Ny liste», gi nytt navn, slett. Lenker i en vare vises som en egen knapp.
- **Helligdager og merkedager** (røde dager, advent, sankthans, morsdag/farsdag, sommertid …) regnes ut for hvert år og vises i kalender, ukemeny og på startskjermen. Kan slås av i innstillingene.
- **Bursdager**: skriv «Ida 14.03.2015» eller «Bursdag Ola 1. des» – gjentas hvert år og viser alder («Ida fyller 11») når fødselsåret er kjent.
- **Andre kalendere**: abonner på .ics-lenker (iCloud, Google, skole – og Spond via en egen iCloud-kalender). Avtalene vises i kalenderen, på startskjermen og i ukemenyen, merket med kilden. Serveren henter dem på nytt etter 10 minutter når appen brukes.
- **Autoutfylling**: forslag fra tidligere varer, retter (med oppskriftslenke) og avtaler (med klokkeslett) mens du skriver (mest brukte først, delt i familien). Trykk × på et forslag for å glemme det.
- **Kalender**: felles avtaler per uke (tittel, dato, fra–til-klokkeslett). Skriv avtaler på vanlig norsk i hurtigfeltet, f.eks. «Fotball tir og tor 17:30-19 hver uke i 3 mnd» – appen viser tolkningen før du lagrer. Trykk hvor som helst på en dag for å fylle ut skjema. Avtaler kan gjentas hver dag, hver uke eller annenhver uke (på valgte ukedager), hver måned eller hvert år – i 1, 3 eller 6 måneder, eller for alltid. Kan også abonneres på i iPhone-kalenderen (`webcal://…/cal/<kode>/kalender.ics`).
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

## Ikoner

Appikon og ikoner i appen er fra [UIX Sharp](https://github.com/mdrakibshekh/uix-icons) av MD Rakib Shekh (MIT-lisens), hentet via Iconify. Appikonet bruker `uix-sharp:calendar-heart`.
