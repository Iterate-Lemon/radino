// Die Skala: eine Zeitleiste als Senderskala, an der die Songkarten hängen.
//
// Karten werden frei positioniert (transform), damit Lücken weich aufgehen und
// die Karte im Spiel dorthin gleiten und landen kann. Die Skala kennt keine
// Spielregeln: Sie zeigt, was man ihr mit update() gibt, und meldet Eingaben.
//
// update({ stations, slot, mode, reveal, runde })
//   stations: [{ id, t, a, y }]  Zeitleiste, nach Jahr sortiert
//   slot:     gewählte Lücke oder null
//   mode:     'waehlen' (ich bin dran) | 'zuschauen' | 'offen' (aufgedeckt) | 'ruhe'
//   reveal:   { song, correct, correctSlots } bei mode 'offen'
//   runde:    Nummer der Karte im Spiel (neue Nummer = neue verdeckte Karte)
//   dino:     true = der Dino hüpft auf der Skala (Spielende, nur bei mode 'ruhe')
// Regel „Marken“ (alles optional):
//   fest:     true = die Lücke ist festgelegt, die Karte ist eingerastet und noch verdeckt
//   zweifel:  { frei: [Lücke], tipps: [{ key, slot, name, ich, urteil: null|'gut'|'schlecht' }] }
//             frei = Lücken, in die ich meine Marke stecken darf; tipps = Marken der Anzweifler
//   dieb:     Name des Anzweiflers, der die Karte bekommt (bei mode 'offen' nach einem Fehlgriff)
//   geklaut:  true = die Karte ist schon beim Dieb und hängt nicht mehr über der Skala

import { h, warte } from './dom.js';
import { pixeltext, kannPixel, dino, symbol, marke } from './pixel.js';
import { spiele, stufe } from './klang.js';

// Jede Karte bekommt eine feste Farbe. Sie hängt am Jahr: Dieselbe Karte sieht bei
// allen gleich aus, und benachbarte Jahre bekommen deutlich verschiedene Farben
// (gleich sind nur Jahre im Abstand von 8).
const FARBEN = ['#dc7f97', '#4fada3', '#d6a83c', '#7f7ad8', '#dc7850', '#689fd6', '#a0b24f', '#cc77bd'];
const farbe = (song) => FARBEN[(((Number(song.y) || 0) * 3) % FARBEN.length + FARBEN.length) % FARBEN.length];

const KARTE_MAX = 164;
const KARTE_MIN = 88;

// Der Aufbau einer Karte (siehe ui.css): Schatten, Ring, Kante, Fläche mit Loch.
function karte(klasse, inhalt, marke) {
  return h('div', { class: `karte ${klasse}` },
    h('span', { class: 'k-schatten' }), h('span', { class: 'k-ring' }), h('span', { class: 'k-kante' }),
    h('div', { class: 'k-flaeche' }, h('span', { class: 'k-loch' }), inhalt),
    marke);
}

/** Beschreibt eine Lücke in Worten, z. B. „Zwischen 1979 und 1991“. */
export function lueckenText(tl, i) {
  const l = tl[i - 1]?.y;
  const r = tl[i]?.y;
  if (l === undefined && r === undefined) return 'Hier';
  if (l === undefined) return `Vor ${r}`;
  if (r === undefined) return `Nach ${l}`;
  return `Zwischen ${l} und ${r}`;
}

export class Skala {
  constructor({ onSelect, onLock, onTipp, onTippFest } = {}) {
    this.onSelect = onSelect || (() => {});
    this.onLock = onLock || (() => {});
    this.onTipp = onTipp || (() => {}); // Marke probehalber gesteckt
    this.onTippFest = onTippFest || (() => {}); // Enter: Tipp bestätigen
    this.tippWahl = null; // { runde, slot }: wo meine Marke probehalber steckt
    this.tippEls = new Map();
    this.klauNr = 0;
    this.fliegt = false;
    this.karten = new Map();
    this.view = { stations: [], slot: null, mode: 'ruhe', reveal: null, runde: null };
    this.geom = null;
    this.zieht = null;
    this.ersteLage = true;
    this.gerollt = null;
    this.wunsch = null; // eben selbst gewählte Lücke, bis der Spielstand sie bestätigt
    // Klänge: was schon zu hören war, damit nichts doppelt oder beim Neuladen erklingt
    this.klangSlot = null;
    this.festRunde = null;
    this.tippRunde = null;
    this.tippGehoert = new Set();

    this.linie = h('div', { class: 'skala-linie' });
    this.lage = h('div', { class: 'skala-karten' });
    this.treffer = h('div', { class: 'skala-treffer' });
    this.geist = h('div', { class: 'geist' });
    // Zeigt nach einem Fehlgriff, wo die Karte hingehört hätte.
    this.geisterJahr = h('span', { class: 'g-jahr' });
    this.geisterText = h('span', {}, 'hier wäre richtig gewesen');
    this.geisterkarte = h('div', { class: 'geisterkarte' }, this.geisterJahr, this.geisterText);
    this.tipps = h('div', { class: 'skala-tipps' });
    this.schild = h('span', { class: 'k-schild' });

    this.ziffern = [0, 1, 2, 3].map(() => h('span', { class: 'rolle' }, ['?', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => pixeltext(z))));
    this.kKuenstler = h('span', { class: 'k-kuenstler' });
    this.kTitel = h('span', { class: 'k-titel' });
    this.kachel = karte('kachel rueck', [
      h('div', { class: 'k-rueck', 'aria-hidden': 'true' }, dino('steht'), pixeltext('????')),
      h('div', { class: 'k-vorn' },
        h('div', { class: 'k-jahr' }, h('span', { class: 'zaehler', 'aria-hidden': 'true' }, this.ziffern.map((r) => h('span', { class: 'ziffer' }, r)))),
        h('div', { class: 'k-text' }, this.kKuenstler, this.kTitel)),
    ], [h('span', { class: 'k-marke schlecht' }, symbol('kreuz')), h('span', { class: 'k-marke schloss' }, symbol('schloss')), this.schild]);
    this.zeiger = h('div', { class: 'zeiger weg' }, h('div', { class: 'nadel' }), this.kachel);

    this.maskottchen = h('div', { class: 'skala-dino', 'aria-hidden': 'true' }, dino('steht'));
    this.buehne = h('div', { class: 'skala' }, this.linie, this.lage, this.geisterkarte, this.treffer, this.geist, this.tipps, this.maskottchen, this.zeiger);
    // Der Rahmen lässt sehr lange Zeitleisten seitlich scrollen.
    this.el = h('div', { class: 'skala-rahmen' }, this.buehne);

    this.kachel.addEventListener('pointerdown', (e) => this.greifen(e));
    this.kachel.addEventListener('pointermove', (e) => this.ziehen(e));
    this.kachel.addEventListener('pointerup', () => this.loslassen());
    this.kachel.addEventListener('pointercancel', () => this.loslassen());
    this.tasten = (e) => this.taste(e);
    document.addEventListener('keydown', this.tasten);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.el);
  }

  entfernen() {
    this.klauNr += 1;
    this.flieger?.remove();
    document.removeEventListener('keydown', this.tasten);
    this.ro.disconnect();
  }

  update(view) {
    const vorher = this.view;
    this.view = { reveal: null, slot: null, runde: null, zweifel: null, ...view };
    const v = this.view;
    if (this.tippWahl && (this.tippWahl.runde !== v.runde || !v.zweifel?.frei?.includes(this.tippWahl.slot))) this.tippWahl = null;
    const waehlbar = v.mode === 'waehlen' || v.mode === 'zuschauen';
    const warWaehlbar = vorher.mode === 'waehlen' || vorher.mode === 'zuschauen';

    // Die eigene Wahl gilt sofort, auch wenn der Spielstand noch unterwegs ist.
    if (this.wunsch) {
      const gilt = v.mode === 'waehlen' && this.wunsch.runde === v.runde && Date.now() < this.wunsch.bis;
      if (!gilt || v.slot === this.wunsch.slot) this.wunsch = null;
      else v.slot = this.wunsch.slot;
    }
    const gleicheRunde = vorher.runde === v.runde; // sonst: neue Karte oder erstes Zeichnen
    const slotJetzt = waehlbar ? v.slot : null;
    if (gleicheRunde && slotJetzt !== null && slotJetzt !== this.klangSlot && !v.fest) this.rueckKlang(slotJetzt);
    this.klangSlot = slotJetzt;

    // Wo die Karte im Spiel gerade ist: Von dort fällt sie in die Zeitleiste.
    const landet = v.mode === 'offen' && v.reveal?.correct && warWaehlbar;
    const von = landet ? this.kachel.getBoundingClientRect() : null;

    // Karten abgleichen (nach Song-ID), damit vorhandene weich wandern.
    const ids = new Set(v.stations.map((s) => s.id));
    for (const [id, el] of this.karten) {
      if (!ids.has(id)) { el.remove(); this.karten.delete(id); }
    }
    const neue = [];
    for (const s of v.stations) {
      let el = this.karten.get(s.id);
      if (!el) {
        el = karte('station kommt', [
          h('div', { class: 'k-jahr' }, pixeltext(s.y)),
          h('div', { class: 'k-text' }, h('span', { class: 'k-kuenstler' }, s.a), h('span', { class: 'k-titel' }, s.t)),
        ], h('span', { class: 'k-marke gut' }, symbol('haken')));
        el.style.setProperty('--farbe', farbe(s));
        this.karten.set(s.id, el);
        this.lage.append(el);
        neue.push(el);
      }
      el.classList.toggle('neu', !!(v.mode === 'offen' && v.reveal?.correct && v.reveal.song.id === s.id));
    }

    // Die Karte im Spiel
    const falsch = !!(v.mode === 'offen' && v.reveal && !v.reveal.correct);
    if (falsch && this.gerollt !== v.reveal.song.id) {
      this.fuelleVorn(v.reveal.song);
      this.gerollt = v.reveal.song.id;
      this.kachel.classList.remove('rueck');
      this.zeigeJahr(v.reveal.song.y, false);
    }
    const z = this.zeiger.classList;
    if (v.fest && this.festRunde !== v.runde) {
      if (gleicheRunde) spiele('fest');
      this.festRunde = v.runde; // je Karte erklingt der Riegel nur einmal
    }
    z.toggle('fest', !!v.fest);
    if (waehlbar && (!warWaehlbar || v.runde !== vorher.runde)) this.verdecke();
    if (!falsch) this.kachel.classList.remove('geklaut');
    if (falsch && !this.kachel.classList.contains('falsch') && gleicheRunde) spiele('falsch');
    this.kachel.classList.toggle('falsch', falsch);
    z.toggle('falsch', falsch);
    z.toggle('greifbar', v.mode === 'waehlen');
    const weg = v.mode === 'ruhe' || (v.mode === 'offen' && !falsch) || (falsch && (!!v.geklaut || this.fliegt));
    if (weg && landet) z.add('sofort');
    z.toggle('weg', weg);

    const flieger = landet ? this.karten.get(v.reveal.song.id) : null;
    this.layout(neue, flieger && von ? { el: flieger, von } : null);
    if (weg && landet) { void this.zeiger.offsetWidth; z.remove('sofort'); }

    // Neue Karten stehen schon an ihrem Platz und blenden jetzt ein. Wechselt die
    // ganze Zeitleiste (anderer Spieler), kommen sie kurz nacheinander.
    const gestaffelt = neue.length > 1 && neue.length === v.stations.length;
    neue.forEach((el, i) => {
      if (el === flieger) return;
      void el.offsetWidth;
      el.style.transitionDelay = gestaffelt ? `${i * 45}ms` : '';
      el.classList.remove('kommt');
    });
  }

  /** Eigene Wahl: gilt sofort, der Spielstand zieht nach. */
  waehle(i) {
    if (this.view.mode !== 'waehlen') return;
    this.wunsch = { slot: i, runde: this.view.runde, bis: Date.now() + 2000 };
    if (this.view.slot !== i) {
      this.view.slot = i;
      this.layout();
      this.rueckKlang(i);
      this.klangSlot = i;
    }
    this.onSelect(i);
  }

  // Klang beim Einrücken: Wie beim Drehen an einer Senderskala steigt der Ton nach rechts.
  rueckKlang(i) {
    const mitte = Math.floor(this.view.stations.length / 2);
    spiele('ruecken', 0, stufe(Math.max(-5, Math.min(5, i - mitte))));
  }

  /** Die Karte dreht sich um, dann rasten die Ziffern auf das Jahr ein. */
  async rolle(song) {
    this.fuelleVorn(song);
    this.gerollt = song.id;
    this.zeiger.classList.remove('greifbar');
    // Ohne Anzweifel-Phase gab es noch keinen Riegel-Klang: Dann kommt er direkt vor dem Umdrehen.
    const ohneRiegel = this.festRunde !== this.view.runde;
    this.festRunde = this.view.runde;
    if (ohneRiegel) spiele('fest');
    spiele('dreh', ohneRiegel ? 0.08 : 0);
    this.kachel.classList.add('dreht');
    await warte(150);
    this.kachel.classList.remove('rueck');
    this.kachel.classList.remove('dreht');
    await warte(260);
    this.zeigeJahr(song.y, true);
    await warte(1350);
  }

  fuelleVorn(song) {
    this.kachel.style.setProperty('--farbe', farbe(song));
    this.kKuenstler.textContent = song.a ?? '';
    this.kTitel.textContent = song.t ?? '';
  }

  zeigeJahr(jahr, animiert) {
    const text = String(Math.max(0, Math.trunc(Number(jahr)) || 0)).padStart(4, '0').slice(-4);
    this.ziffern.forEach((r, i) => {
      const schritte = Number(text[i]) + 1;
      if (animiert) spiele('ziffer', i * 0.12 + 0.3 + schritte * 0.055); // genau wenn die Ziffer steht
      r.style.transition = animiert ? `transform ${0.3 + schritte * 0.055}s steps(${schritte}) ${i * 120}ms` : 'none';
      r.style.transform = `translateY(calc(var(--kp) * ${-9 * schritte}))`;
    });
  }

  verdecke() {
    this.gerollt = null;
    this.klauNr += 1;
    this.fliegt = false;
    this.flieger?.remove();
    this.kachel.classList.remove('geklaut');
    this.zeiger.classList.add('sofort');
    this.kachel.classList.add('rueck');
    this.kachel.classList.remove('falsch', 'dreht');
    this.ziffern.forEach((r) => { r.style.transition = 'none'; r.style.transform = 'translateY(0)'; });
    void this.zeiger.offsetWidth;
    this.zeiger.classList.remove('sofort');
  }

  layout(neue = [], flug = null) {
    const v = this.view;
    const sichtbar = this.el.clientWidth;
    if (!sichtbar) return;
    // Beim allerersten Layout nichts hereinschieben: alles steht sofort am Platz.
    const sofort = this.ersteLage;
    this.ersteLage = false;
    if (sofort) { neue = [...this.karten.values()]; this.zeiger.classList.add('sofort'); }

    const n = v.stations.length;
    const waehlbar = v.mode === 'waehlen' || v.mode === 'zuschauen';
    const falsch = !!(v.mode === 'offen' && v.reveal && !v.reveal.correct);
    // Ein Platz bleibt frei: beim Wählen für die neue Karte, nach einem Fehlgriff
    // für die Stelle, an die sie gehört hätte.
    const plaetze = Math.max(1, n + (waehlbar || falsch ? 1 : 0));
    const g = plaetze > 7 ? 10 : 16;
    // Passen die Karten selbst in kleinster Größe nicht, wird die Skala breiter als
    // ihr Rahmen und lässt sich seitlich scrollen.
    const W = Math.max(sichtbar, plaetze * KARTE_MIN + (plaetze + 1) * g);
    this.buehne.style.width = W > sichtbar ? `${W}px` : '';
    const w = Math.min(KARTE_MAX, Math.max(KARTE_MIN, (W - (plaetze + 1) * g) / plaetze));
    const total = plaetze * w + (plaetze + 1) * g;
    const start = Math.max(0, (W - total) / 2);
    const s = waehlbar ? v.slot : falsch ? (v.reveal.correctSlots?.[0] ?? 0) : null;
    const schritt = w + g;

    // Kartenmaße: quadratisch, die Pixelgröße der Jahreszahl richtet sich nach der Breite.
    const wi = w - 6;
    const H = wi;
    const p = wi >= 151 ? 5 : wi >= 124 ? 4 : 3; // die Jahreszahl muss in den Innenrahmen passen
    const feiert = v.mode === 'ruhe' && !!v.dino;
    if (feiert && !sofort && !this.maskottchen.classList.contains('da')) spiele('sieg', 0.2);
    const kopf = v.mode === 'ruhe' ? (feiert ? 78 : 16) : H + 36;
    this.maskottchen.classList.toggle('da', feiert);
    this.maskottchen.style.transform = `translateX(${W / 2 - 36}px)`;
    const oben = kopf + 17;
    const st = this.buehne.style;
    st.setProperty('--kw', `${wi}px`);
    st.setProperty('--kh', `${H}px`);
    st.setProperty('--kp', `${p}px`);
    st.setProperty('--rp', `${p >= 4 ? 3 : 2}px`);
    st.setProperty('--kt', `${p >= 5 ? 13 : 12}px`);
    st.setProperty('--kopf', `${kopf}px`);
    st.height = `${oben + H + 10 + 12}px`;

    const xs = [];
    const mitten = []; // Mitte jeder Lücke im aktuellen Layout
    if (waehlbar && s === null) {
      // Noch keine Lücke gewählt: Karten stehen mittig, die Lücken liegen dazwischen.
      const a = start + schritt / 2;
      for (let i = 0; i < n; i++) xs.push(a + g + i * schritt);
      for (let i = 0; i <= n; i++) mitten.push(a + g / 2 + i * schritt);
    } else {
      for (let i = 0; i < n; i++) xs.push(start + g + (i + (s !== null && i >= s ? 1 : 0)) * schritt);
      for (let i = 0; i <= n; i++) {
        if (s === null) mitten.push(start + g / 2 + i * schritt);
        else if (i === s) mitten.push(start + g + s * schritt + w / 2);
        else mitten.push(start + g / 2 + (i + (i > s ? 1 : 0)) * schritt);
      }
    }
    // Ruhelage (keine Lücke offen): Grundlage für Trefferflächen und Ziehen.
    const ruheStart = start + (waehlbar ? schritt / 2 : 0);
    const ruheMitte = (i) => ruheStart + g + i * schritt + w / 2;
    this.geom = { W, sichtbar, n, w, wi, H, oben, mitten, xs, ruheMitte };

    v.stations.forEach((song, i) => {
      const el = this.karten.get(song.id);
      const ziel = `translate(${xs[i] + 3}px, 0)`;
      if (flug && flug.el === el) {
        // Die aufgedeckte Karte fällt von ihrem Platz über der Skala in die Lücke.
        const l = this.lage.getBoundingClientRect();
        el.classList.remove('kommt');
        el.style.transition = 'none';
        el.style.transform = `translate(${flug.von.left - l.left}px, ${flug.von.top - l.top - oben}px)`;
        void el.offsetWidth;
        el.style.transition = '';
        el.classList.add('landet');
        el.style.transform = ziel;
        spiele('richtig', 0.3);
        setTimeout(() => { el.classList.remove('landet'); this.funken(xs[i] + 3, oben); }, 330);
        return;
      }
      if (neue.includes(el)) el.style.transition = 'none';
      el.style.transform = ziel;
      if (neue.includes(el)) { void el.offsetWidth; el.style.transition = ''; }
    });

    // Trefferflächen: von Kartenmitte zu Kartenmitte, großzügig klickbar.
    if (v.mode === 'waehlen') {
      if (this.treffer.children.length !== n + 1) {
        this.treffer.replaceChildren(...Array.from({ length: n + 1 }, (_, i) => h('button', {
          type: 'button',
          tabindex: -1, // Tastatur: Pfeiltasten und Enter, siehe taste()
          onclick: () => this.waehle(i),
          onpointerenter: () => this.zeigeGeist(i),
          onpointerleave: () => this.zeigeGeist(null),
        })));
      }
      [...this.treffer.children].forEach((b, i) => {
        const links = i === 0 ? 0 : ruheMitte(i - 1);
        const rechts = i === n ? W : ruheMitte(i);
        b.style.left = `${links}px`;
        b.style.width = `${rechts - links}px`;
        b.setAttribute('aria-label', lueckenText(v.stations, i));
        b.setAttribute('aria-pressed', String(i === v.slot));
      });
    } else if (this.treffer.children.length) {
      this.treffer.replaceChildren();
    }
    this.zeigeGeist(this.geistSlot ?? null);

    // Zeiger
    let zx = W / 2;
    let geparkt = true;
    if (falsch) { geparkt = false; zx = mitten[v.slot ?? 0] ?? W / 2; }
    else if (waehlbar && v.slot !== null) { geparkt = false; zx = mitten[v.slot] ?? W / 2; }
    this.zeiger.classList.toggle('geparkt', geparkt);
    if (!this.zieht?.bewegt) {
      this.setzeZeiger(zx);
      if (W > sichtbar && !geparkt) this.zeigeStelle(zx);
    }

    // „Hier wäre richtig gewesen“: eine grüne Geisterkarte am richtigen Platz.
    if (falsch) {
      const jahr = String(v.reveal.song.y);
      if (this.geisterJahr.dataset.jahr !== jahr) {
        this.geisterJahr.dataset.jahr = jahr;
        this.geisterJahr.replaceChildren(pixeltext(jahr));
      }
      this.geisterkarte.style.transform = `translate(${start + g + s * schritt + 3}px, 0)`;
      this.geisterText.textContent = v.dieb ? `richtig getippt von ${v.dieb}` : 'hier wäre richtig gewesen';
    }
    this.geisterkarte.classList.toggle('da', falsch);
    this.legeTipps(schritt);

    if (sofort) { void this.zeiger.offsetWidth; this.zeiger.classList.remove('sofort'); }
  }

  // Regel „Marken“: vorgezeichnete Plätze in den freien Lücken und die Marken der Anzweifler.
  legeTipps(schritt = this.geom.w) {
    const { mitten, W } = this.geom;
    const zw = this.view.zweifel;
    // Klang nur für Marken, die jetzt neu gesteckt werden (nicht beim ersten Zeichnen einer Runde).
    const leise = this.tippRunde !== this.view.runde;
    if (leise) { this.tippRunde = this.view.runde; this.tippGehoert.clear(); }
    const soll = new Map();
    if (zw) {
      const belegt = new Set();
      for (const t of zw.tipps) {
        if (t.slot >= mitten.length) continue;
        belegt.add(t.slot);
        soll.set(`p:${t.key}`, { ...t, art: 'fest' });
        if (!this.tippGehoert.has(t.key)) {
          this.tippGehoert.add(t.key);
          if (!leise) spiele('tipp');
        }
      }
      for (const i of zw.frei) {
        if (belegt.has(i) || i >= mitten.length) continue;
        const meins = this.tippWahl?.slot === i;
        soll.set(`f:${i}`, { slot: i, art: meins ? 'wahl' : 'frei', name: meins ? 'dein Tipp?' : '' });
      }
    }
    for (const [key, el] of this.tippEls) {
      if (!soll.has(key)) { el.remove(); this.tippEls.delete(key); }
    }
    for (const [key, t] of soll) {
      let el = this.tippEls.get(key);
      if (!el) {
        el = h('div', {},
          t.art === 'fest' ? null : h('button', { type: 'button', class: 't-flaeche', tabindex: -1, onclick: () => this.waehleTipp(t.slot) }),
          h('span', { class: 't-name' }),
          h('span', { class: 't-kopf' }, symbol('umriss'), marke(),
            h('span', { class: 't-urteil gut' }, symbol('haken')), h('span', { class: 't-urteil schlecht' }, symbol('kreuz'))),
          h('span', { class: 't-nadel' }));
        this.tippEls.set(key, el);
        this.tipps.append(el);
      }
      el.className = `tipp ${t.art}${t.ich ? ' ich' : ''}${t.urteil ? ` ${t.urteil}` : ''}`;
      const x = mitten[t.slot];
      el.style.transform = `translateX(${x}px)`;
      const name = el.querySelector('.t-name');
      if (name.textContent !== t.name) name.textContent = t.name;
      name.style.maxWidth = `${Math.max(48, schritt - 10)}px`;
      const flaeche = el.querySelector('.t-flaeche');
      if (flaeche) {
        // großzügig klickbar: bis zur Mitte zwischen dieser und der nächsten Lücke
        const links = t.slot === 0 ? 0 : (mitten[t.slot - 1] + x) / 2;
        const rechts = t.slot === mitten.length - 1 ? W : (mitten[t.slot + 1] + x) / 2;
        flaeche.style.left = `${links - x}px`;
        flaeche.style.width = `${rechts - links}px`;
        flaeche.setAttribute('aria-label', `Anzweifeln: ${lueckenText(this.view.stations, t.slot)}`);
        flaeche.setAttribute('aria-pressed', String(t.art === 'wahl'));
      }
    }
  }

  /** Meine Marke probehalber in eine freie Lücke stecken. Fest wird es erst mit onTippFest. */
  waehleTipp(i) {
    if (!this.view.zweifel?.frei?.includes(i)) return;
    if (this.tippWahl?.slot !== i) this.rueckKlang(i);
    this.tippWahl = { runde: this.view.runde, slot: i };
    this.legeTipps();
    this.onTipp(i);
  }

  /**
   * Ein Anzweifler bekommt die Karte: Sie zeigt kurz sein Namensschild und fliegt dann
   * zu seiner Zeitleiste (ziel() liefert das Element dort). Liefert true, wenn sie ankam.
   */
  async klau(text, ziel) {
    this.klauNr += 1;
    const nr = this.klauNr;
    await warte(1100);
    if (nr !== this.klauNr) return false;
    this.schild.replaceChildren(kannPixel(text) && text.length <= 14 ? pixeltext(text) : text);
    this.kachel.classList.add('geklaut');
    await warte(1000);
    if (nr !== this.klauNr) return false;

    const von = this.kachel.getBoundingClientRect();
    const song = this.view.reveal?.song;
    const f = karte('flieger', song ? [
      h('div', { class: 'k-jahr' }, pixeltext(song.y)),
      h('div', { class: 'k-text' }, h('span', { class: 'k-kuenstler' }, song.a), h('span', { class: 'k-titel' }, song.t)),
    ] : []);
    for (const name of ['--kw', '--kh', '--kp', '--kt']) f.style.setProperty(name, this.buehne.style.getPropertyValue(name));
    if (song) f.style.setProperty('--farbe', farbe(song));
    f.style.left = `${von.left}px`;
    f.style.top = `${von.top}px`;
    this.flieger = f;
    document.body.append(f);
    this.fliegt = true;
    this.zeiger.classList.add('weg');
    spiele('klau');

    const z = ziel?.()?.getBoundingClientRect();
    const dx = z ? z.left + z.width / 2 - (von.left + von.width / 2) : 0;
    const dy = z ? z.top + z.height / 2 - (von.top + von.height / 2) : window.innerHeight - von.top;
    const flug = f.animate([
      { transform: 'translate(0, 0) scale(1)' },
      { transform: 'translate(0, -22px) scale(1.05)', offset: 0.28, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
      { transform: `translate(${dx}px, ${dy}px) scale(0.28)` },
    ], { duration: 640, fill: 'forwards' });
    // In einem Tab im Hintergrund steht die Animation still: dann nicht ewig warten.
    await Promise.race([flug.finished.catch(() => {}), warte(1200)]);
    f.remove();
    if (this.flieger === f) this.flieger = null;
    return nr === this.klauNr;
  }

  klauAbbruch() {
    this.klauNr += 1;
    this.flieger?.remove();
    this.flieger = null;
  }

  setzeZeiger(x) {
    const { W, wi } = this.geom;
    const halb = wi / 2 + 3;
    const schub = Math.min(Math.max(x, halb), W - halb) - x;
    this.zeiger.style.transform = `translateX(${x}px)`;
    this.kachel.style.setProperty('--schub', `${schub}px`);
  }

  // Bei einer scrollbaren Skala die Stelle der Karte ins Bild holen.
  zeigeStelle(x) {
    const { sichtbar, w } = this.geom;
    const links = this.el.scrollLeft;
    if (x - w < links || x + w > links + sichtbar) {
      this.el.scrollTo({ left: Math.max(0, x - sichtbar / 2), behavior: 'smooth' });
    }
  }

  // Kleine Pixelfunken rund um eine gelandete Karte.
  funken(x, y) {
    const { wi, H } = this.geom;
    const f = h('div', { class: 'funken' });
    f.style.transform = `translate(${x}px, ${y}px)`;
    for (const [px, py] of [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]]) {
      const i = h('i');
      i.style.left = `${px * wi - 3}px`;
      i.style.top = `${py * H - 3}px`;
      i.style.setProperty('--dx', `${(px - 0.5) * 60}px`);
      i.style.setProperty('--dy', `${(py - 0.5) * 60}px`);
      f.append(i);
    }
    this.buehne.append(f);
    setTimeout(() => f.remove(), 700);
  }

  zeigeGeist(i) {
    this.geistSlot = i;
    const an = i !== null && this.view.mode === 'waehlen' && i !== this.view.slot && !this.zieht && i < this.geom.mitten.length;
    this.geist.classList.toggle('da', an);
    if (an) this.geist.style.transform = `translateX(${this.geom.mitten[i]}px)`;
  }

  slotBei(x) {
    let s = 0;
    for (let i = 0; i < this.geom.n; i++) if (this.geom.ruheMitte(i) < x) s = i + 1;
    return s;
  }

  greifen(e) {
    if (this.view.mode !== 'waehlen' || !this.zeiger.classList.contains('greifbar')) return;
    this.zieht = { x0: e.clientX, bewegt: false };
    this.kachel.setPointerCapture(e.pointerId);
    this.zeigeGeist(null);
  }

  ziehen(e) {
    if (!this.zieht) return;
    if (Math.abs(e.clientX - this.zieht.x0) > 4) this.zieht.bewegt = true;
    if (!this.zieht.bewegt) return;
    const r = this.buehne.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - r.left, 0), this.geom.W);
    this.zeiger.classList.add('zieht');
    this.zeiger.classList.remove('geparkt');
    this.setzeZeiger(x);
    const s = this.slotBei(x);
    if (s !== this.view.slot) this.waehle(s);
  }

  loslassen() {
    if (!this.zieht) return;
    this.zieht = null;
    this.zeiger.classList.remove('zieht');
    this.layout();
  }

  taste(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.querySelector('dialog[open]') || e.target.closest?.('input, textarea, select')) return;
    // Regel „Marken“: Pfeiltasten wandern durch die freien Lücken, Enter bestätigt den Tipp.
    const frei = this.view.zweifel?.frei;
    if (frei?.length) {
      const sortiert = [...frei].sort((x, y) => x - y);
      const jetzt = this.tippWahl?.slot ?? null;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const d = e.key === 'ArrowLeft' ? -1 : 1;
        const pos = sortiert.indexOf(jetzt);
        const neu = pos < 0 ? (d > 0 ? 0 : sortiert.length - 1) : Math.min(sortiert.length - 1, Math.max(0, pos + d));
        this.waehleTipp(sortiert[neu]);
      } else if (e.key === 'Enter' && jetzt !== null && !e.target.closest?.('button, a')) {
        e.preventDefault();
        this.onTippFest();
      }
      return;
    }
    if (this.view.mode !== 'waehlen' || !this.zeiger.classList.contains('greifbar')) return;
    const n = this.view.stations.length;
    const s = this.view.slot;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      this.waehle(s === null ? Math.floor((n + (d > 0 ? 1 : 0)) / 2) : Math.min(n, Math.max(0, s + d)));
    } else if (e.key === 'Enter' && s !== null && !e.target.closest?.('button, a')) {
      e.preventDefault();
      this.onLock();
    }
  }
}
