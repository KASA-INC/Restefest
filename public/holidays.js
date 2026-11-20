// Norske helligdager (røde dager) og merkedager, regnet ut for et gitt år.
// Bevegelige dager følger påsken, advent regnes bakover fra jul.

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const plus = (d, n) => new Date(d.getTime() + n * 864e5);

// Første påskedag (gregoriansk, «anonym» algoritme).
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return day(y, month, ((h + l - 7 * m + 114) % 31) + 1);
}

// n-te søndag i en måned (n = -1 for siste).
function sunday(y, m, n) {
  if (n > 0) {
    const first = day(y, m, 1);
    return plus(first, ((7 - first.getUTCDay()) % 7) + (n - 1) * 7);
  }
  const last = day(y, m + 1, 0);
  return plus(last, -last.getUTCDay());
}

const cache = {};
/** @returns {Array<{date: string, title: string, red: boolean}>} */
export function holidaysFor(y) {
  if (cache[y]) return cache[y];
  const e = easter(y);
  // 4. søndag i advent er siste søndag før 1. juledag.
  const advent4 = plus(day(y, 12, 24), -day(y, 12, 24).getUTCDay());
  const list = [
    // Røde dager
    [day(y, 1, 1), "Nyttårsdag", true],
    [plus(e, -3), "Skjærtorsdag", true],
    [plus(e, -2), "Langfredag", true],
    [e, "1. påskedag", true],
    [plus(e, 1), "2. påskedag", true],
    [day(y, 5, 1), "Arbeidernes dag", true],
    [day(y, 5, 17), "Grunnlovsdagen", true],
    [plus(e, 39), "Kristi himmelfartsdag", true],
    [plus(e, 49), "1. pinsedag", true],
    [plus(e, 50), "2. pinsedag", true],
    [day(y, 12, 25), "1. juledag", true],
    [day(y, 12, 26), "2. juledag", true],
    // Merkedager
    [day(y, 2, 6), "Samefolkets dag", false],
    [sunday(y, 2, 2), "Morsdag", false],
    [day(y, 2, 14), "Valentinsdag", false],
    [plus(e, -49), "Fastelavnssøndag", false],
    [day(y, 3, 8), "Kvinnedagen", false],
    [sunday(y, 3, -1), "Sommertid – klokka fram en time", false],
    [plus(e, -7), "Palmesøndag", false],
    [plus(e, -1), "Påskeaften", false],
    [day(y, 5, 8), "Frigjøringsdagen", false],
    [plus(e, 48), "Pinseaften", false],
    [day(y, 6, 23), "Sankthansaften", false],
    [day(y, 7, 29), "Olsok", false],
    [sunday(y, 10, -1), "Vintertid – klokka tilbake en time", false],
    [day(y, 10, 31), "Halloween", false],
    [sunday(y, 11, 1), "Allehelgensdag", false],
    [sunday(y, 11, 2), "Farsdag", false],
    [plus(advent4, -21), "1. søndag i advent", false],
    [plus(advent4, -14), "2. søndag i advent", false],
    [plus(advent4, -7), "3. søndag i advent", false],
    [advent4, "4. søndag i advent", false],
    [day(y, 12, 13), "Luciadagen", false],
    [day(y, 12, 23), "Lille julaften", false],
    [day(y, 12, 24), "Julaften", false],
    [day(y, 12, 31), "Nyttårsaften", false],
  ];
  return (cache[y] = list.map(([d, title, red]) => ({ date: iso(d), title, red })));
}

export const holidaysOn = (dateIso) => holidaysFor(Number(dateIso.slice(0, 4))).filter((h) => h.date === dateIso);
