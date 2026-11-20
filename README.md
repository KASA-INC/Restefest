# Handleliste

Enkel familie-handleliste med sanntidssynk via **familiekode**.

- **Handleliste** med to faner: *I butikk* og *Oda*. Trykk for å krysse av, «Fjern handlede» rydder.
- **Autoutfylling**: forslag fra tidligere varer mens du skriver (mest brukte først, delt i familien). Trykk × på et forslag for å glemme det.
- **Kalender**: felles avtaler per uke (tittel, dato, fra–til-klokkeslett). Skriv avtaler på vanlig norsk i hurtigfeltet, f.eks. «Fotball tir og tor 17:30-19 hver uke i 3 mnd» – appen viser tolkningen før du lagrer. Trykk hvor som helst på en dag for å fylle ut skjema. Avtaler kan gjentas hver dag, hver uke eller annenhver uke (på valgte ukedager), hver måned eller hvert år – i 1, 3 eller 6 måneder, eller for alltid. Kan også abonneres på i iPhone-kalenderen (`webcal://…/cal/<kode>/kalender.ics`).
- **Ukemeny**: Rett + Link for mandag–søndag, med kalenderens avtaler i liten skrift. Viser inneværende uke mandag–torsdag og neste uke fra fredag kl. 00.00 (Oda-bestilling).
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
npm run deploy     # gir en adresse som https://handleliste.<konto>.workers.dev
```

Åpne adressen i Safari på iPhone → Del → **Legg til på Hjem-skjerm**.

## Ikoner

Appikon og ikoner i appen er fra [UIX Sharp](https://github.com/mdrakibshekh/uix-icons) av MD Rakib Shekh (MIT-lisens), hentet via Iconify. Appikonet bruker `uix-sharp:category-grocery`.
