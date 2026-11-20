# Handleliste

Enkel familie-handleliste med sanntidssynk via **familiekode**.

- **Handleliste** med to faner: *I butikk* og *Oda*. Trykk for å krysse av, «Fjern handlede» rydder.
- **Autoutfylling**: forslag fra tidligere varer mens du skriver (mest brukte først, delt i familien). Trykk × på et forslag for å glemme det.
- **Ukemeny**: Rett + Link for mandag–søndag, med bla mellom uker.
- **Kalender**: ukemenyen kan abonneres på i iPhone-kalenderen (`webcal://…/cal/<kode>.ics`).
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
