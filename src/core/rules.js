// Reine Spielregeln. Keine Abhängigkeiten von DOM, Netzwerk oder Spotify.

/**
 * Prüft, ob ein Jahr an der Lücke `slot` einer Zeitleiste richtig liegt.
 * `years` ist aufsteigend sortiert. Lücke 0 = vor der ersten Karte,
 * Lücke years.length = nach der letzten Karte. Gleiche Jahre gelten auf
 * beiden Seiten als richtig.
 */
export function slotIsCorrect(years, slot, year) {
  if (!Number.isInteger(slot) || slot < 0 || slot > years.length) return false;
  const left = slot > 0 ? years[slot - 1] : -Infinity;
  const right = slot < years.length ? years[slot] : Infinity;
  return left <= year && year <= right;
}

/** Alle Lücken, an denen das Jahr richtig läge (für die Auflösung). */
export function correctSlots(years, year) {
  const out = [];
  for (let i = 0; i <= years.length; i++) if (slotIsCorrect(years, i, year)) out.push(i);
  return out;
}

/** Fisher-Yates mit austauschbarem Zufall (rng liefert [0,1)). Gibt eine Kopie zurück. */
export function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
