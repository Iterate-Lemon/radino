// Klänge der Oberfläche: kurze, leise Töne zu Knöpfen und Animationen.
// Sie werden im Browser erzeugt (Web Audio API), es gibt keine Klangdateien.
// Reine Oberflächensache: Die Spiellogik weiß nichts davon.
//
// Zum Nachstimmen: alles steht in den drei Abschnitten direkt hier unten.

/** Gesamtlautstärke aller Klänge (0 bis 1). Zum Vergleich: Die Musik läuft etwa bei 1. */
const LAUT = 0.25;
/** Alles oberhalb dieser Tonhöhe (Hz) wird gedämpft. Kleiner = dumpfer und weicher. */
const HOEHEN = 2600;
/** So schnell schwingt ein Ton ein (Sekunden). Größer = weicher Anschlag. */
const EIN = 0.008;

// Jeder Klang ist eine kurze Folge von Tönen. Je Ton:
//   t    Beginn in Sekunden nach dem Auslösen (ohne Angabe: sofort)
//   f    Tonhöhe in Hz, mit „bis“ gleitet der Ton dorthin
//   d    Dauer in Sekunden (der Ton klingt in dieser Zeit aus)
//   v    Lautstärke von 0 bis 1 (ohne Angabe 0.5)
//   w    Klangfarbe: 'triangle' weich (Vorgabe), 'sine' rund, 'square' kantig
export const KLAENGE = {
  // Knopfdruck: ein kurzes, tiefes Tippen
  knopf: [{ f: 392, bis: 330, d: 0.05, v: 0.45 }],
  // Lücke gewählt, die Karte rückt ein. Die Tonhöhe folgt der Stelle auf der Skala.
  ruecken: [{ f: 294, bis: 349, d: 0.07, v: 0.55 }],
  // Festgelegt: zwei tiefe Töne wie ein Riegel
  fest: [{ f: 220, d: 0.05, v: 0.28, w: 'square' }, { t: 0.055, f: 165, d: 0.09, v: 0.3, w: 'square' }],
  // Die Karte dreht sich um
  dreh: [{ f: 196, bis: 494, d: 0.16, v: 0.38 }],
  // Eine Ziffer der Jahreszahl rastet ein
  ziffer: [{ f: 659, d: 0.04, v: 0.34 }],
  // Richtig: die Karte landet in der Zeitleiste
  richtig: [{ f: 523, d: 0.1, v: 0.55 }, { t: 0.09, f: 784, d: 0.18, v: 0.55 }],
  // Falsch
  falsch: [{ f: 311, d: 0.12, v: 0.5 }, { t: 0.12, f: 233, d: 0.2, v: 0.5 }],
  // Eine Marke wird zum Anzweifeln gesteckt
  tipp: [{ f: 440, bis: 330, d: 0.08, v: 0.5 }, { t: 0.07, f: 262, d: 0.07, v: 0.4 }],
  // Eine Marke bekommen
  marke: [{ f: 784, d: 0.06, v: 0.42 }, { t: 0.06, f: 1047, d: 0.16, v: 0.42 }],
  // Die Karte fliegt zu dem, der sie geklaut hat, und kommt dort an
  klau: [{ f: 262, bis: 698, d: 0.3, v: 0.32 }, { t: 0.6, f: 659, d: 0.07, v: 0.45 }, { t: 0.67, f: 880, d: 0.16, v: 0.45 }],
  // Spielende mit Sieger
  sieg: [
    { f: 523, d: 0.11, v: 0.5 }, { t: 0.11, f: 659, d: 0.11, v: 0.5 }, { t: 0.22, f: 784, d: 0.11, v: 0.5 },
    { t: 0.33, f: 1047, d: 0.3, v: 0.5 }, { t: 0.33, f: 659, d: 0.3, v: 0.3 },
  ],
  // Klänge eingeschaltet
  an: [{ f: 440, d: 0.06, v: 0.45 }, { t: 0.06, f: 587, d: 0.1, v: 0.45 }],
  // Ein neuer Name wird gewürfelt: der Würfel klackert kurz und bleibt liegen
  wuerfel: [
    { f: 587, d: 0.03, v: 0.28, w: 'square' }, { t: 0.07, f: 494, d: 0.03, v: 0.26, w: 'square' },
    { t: 0.15, f: 659, d: 0.03, v: 0.24, w: 'square' }, { t: 0.25, f: 392, d: 0.07, v: 0.4 },
  ],
};

// ── Erzeugung ────────────────────────────────────────────────────────────────

const STUFEN = [0, 2, 4, 7, 9];
/** Halbtonschritte der k-ten Stufe einer Fünftonleiter (klingt in jeder Folge stimmig). */
export const stufe = (k) => 12 * Math.floor(k / STUFEN.length) + STUFEN[((k % STUFEN.length) + STUFEN.length) % STUFEN.length];

/** Ausgang für alle Klänge: leise gestellt und in den Höhen gedämpft. */
export function kette(ctx) {
  const eingang = ctx.createGain();
  eingang.gain.value = LAUT;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = HOEHEN;
  eingang.connect(filter).connect(ctx.destination);
  return eingang;
}

/** Setzt die Töne eines Klangs in den Zeitplan von ctx. ab = Startzeit, halbton = Verschiebung der Tonhöhe. */
export function setze(ctx, ziel, name, ab, halbton = 0) {
  const faktor = 2 ** (halbton / 12);
  for (const n of KLAENGE[name] || []) {
    const t0 = ab + (n.t || 0);
    const v = n.v ?? 0.5;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = n.w || 'triangle';
    o.frequency.setValueAtTime(n.f * faktor, t0);
    if (n.bis) o.frequency.exponentialRampToValueAtTime(n.bis * faktor, t0 + n.d);
    // weich einschwingen, dann ausklingen: kein Knacken am Anfang oder Ende
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(v, t0 + EIN);
    g.gain.exponentialRampToValueAtTime(v * 0.02, t0 + n.d);
    g.gain.linearRampToValueAtTime(0, t0 + n.d + 0.02);
    o.connect(g).connect(ziel);
    o.start(t0);
    o.stop(t0 + n.d + 0.03);
  }
}

// ── Abspielen ────────────────────────────────────────────────────────────────

const SPEICHER = 'radino.klang';
let ctx = null;
let eingang = null;
let kaputt = false; // dieser Browser kann keine Klänge erzeugen
let an = (() => {
  try {
    return window.localStorage.getItem(SPEICHER) !== 'aus';
  } catch {
    return true;
  }
})();

// Browser erlauben Ton erst nach einem Klick oder Tastendruck: Erst dann entsteht der
// AudioContext. Bis dahin (und wenn etwas schiefgeht) bleibt alles still.
function wecke() {
  if (!an || kaputt) return;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { kaputt = true; return; }
      ctx = new AC();
      eingang = kette(ctx);
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  } catch {
    kaputt = true;
    ctx = null;
  }
}

/** Spielt einen Klang. nach = Verzögerung in Sekunden, halbton = Verschiebung der Tonhöhe. */
export function spiele(name, nach = 0, halbton = 0) {
  // Ein Tab im Hintergrund bleibt still.
  if (!an || !ctx || ctx.state !== 'running' || document.hidden) return;
  try {
    setze(ctx, eingang, name, ctx.currentTime + Math.max(0, nach), halbton);
  } catch {
    /* Klänge sind Beiwerk: Fehler nie nach außen geben */
  }
}

export const klangAn = () => an;

/** Klänge ein- oder ausschalten. Die Einstellung bleibt in diesem Browser gespeichert. */
export function schalteKlang(neu) {
  an = !!neu;
  try {
    window.localStorage.setItem(SPEICHER, an ? 'an' : 'aus');
  } catch {
    /* ohne Speicher gilt die Einstellung bis zum Neuladen */
  }
  if (!an) return;
  wecke();
  // zur Bestätigung ein Ton, sobald die Ausgabe läuft
  Promise.resolve(ctx && ctx.state !== 'running' ? ctx.resume() : null).then(() => spiele('an')).catch(() => {});
}

let gestartet = false;
/** Einmal beim Start aufrufen: weckt den Ton bei der ersten Eingabe und lässt Knöpfe klicken. */
export function starteKlang() {
  if (gestartet) return;
  gestartet = true;
  document.addEventListener('pointerdown', wecke, { capture: true, passive: true });
  document.addEventListener('keydown', wecke, { capture: true, passive: true });
  document.addEventListener('click', (e) => {
    wecke();
    const el = e.target.closest?.('button, summary, input[type="checkbox"], input[type="radio"]');
    // Still bleiben Knöpfe, deren Wirkung einen eigenen Klang hat (data-klang="aus", alles auf der Skala).
    if (!el || el.disabled || el.closest('[data-klang="aus"], .skala')) return;
    spiele('knopf');
  }, { capture: true });
}
