# Handleliste

Enkel familie-handleliste med sanntidssynk via **familiekode**.

- **Handleliste** med to faner: *I butikk* og *Oda*. Trykk for å krysse av, «Fjern handlede» rydder.
- **Ukemeny**: Rett + Link for mandag–søndag, med bla mellom uker.
- **Kalender**: ukemenyen kan abonneres på i iPhone-kalenderen (`webcal://…/cal/<kode>.ics`).
- Ingen innlogging. Alle med samme kode deler data. Koden fungerer som passord, så del den bare med familien.

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
