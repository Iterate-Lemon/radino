// RaDino – Designprototyp. Reine Gestaltung mit Musterdaten.
// Nichts hier spricht mit dem echten Spiel (src/). Die Bausteine sind aber so
// geschnitten, dass sie später in src/ui/ übernommen werden können:
// Texte nur als Textknoten, keine Inline-Styles im Markup, keine externen Quellen.

import { pixeltext, pixelzeile, dino, symbol } from './pixel.js';

// ── DOM-Helfer ───────────────────────────────────────────────────────────────

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const knopf = (label, onclick, cls = '', attrs = {}) =>
  h('button', { type: 'button', class: `knopf ${cls}`.trim(), onclick, ...attrs }, cls.includes('haupt') ? pixeltext(label) : label);
const textknopf = (label, onclick) => h('button', { type: 'button', class: 'textknopf', onclick }, label);
const etikett = (text) => h('h2', { class: 'etikett' }, pixeltext(text));

function wortmarke() {
  const ra = pixeltext('RA', 'ra');
  const dn = pixeltext('DINO', 'dn');
  for (const s of [ra, dn]) { s.removeAttribute('role'); s.setAttribute('aria-hidden', 'true'); }
  return h('span', { class: 'wortmarke', role: 'img', 'aria-label': 'RaDino' }, ra, dn);
}
const lockup = () => h('span', { class: 'lockup' }, dino('steht'), wortmarke());

// ── Musterdaten ──────────────────────────────────────────────────────────────

const S = (y, a, t) => ({ id: `${y}-${a}`, y, a, t });

const START = {
  p1: [S(1965, 'The Rolling Stones', "(I Can't Get No) Satisfaction"), S(1979, 'Dschinghis Khan', 'Moskau'), S(1991, 'Scorpions', 'Wind of Change'), S(2003, 'Outkast', 'Hey Ya!')],
  p2: [S(1974, 'Reinhard Mey', 'Über den Wolken'), S(1988, "Guns N' Roses", "Sweet Child O' Mine"), S(2014, 'Meghan Trainor', 'All About That Bass')],
  p3: [S(1957, 'Elvis Presley', 'Jailhouse Rock'), S(1969, 'David Bowie', 'Space Oddity'), S(1986, 'Rio Reiser', 'König von Deutschland'), S(1993, 'Haddaway', 'What Is Love'), S(2007, 'Ich + Ich', 'Vom selben Stern'), S(2019, 'Billie Eilish', 'bad guy')],
  p4: [S(1960, 'Sam Cooke', '(What A) Wonderful World'), S(1976, 'Boston', 'More Than a Feeling'), S(1992, 'The Cure', "Friday I'm In Love"), S(2000, 'Toploader', 'Dancing in the Moonlight'), S(2013, 'OneRepublic', 'Counting Stars')],
};

const STAPEL = [
  S(1983, 'Rufus, Chaka Khan', "Ain't Nobody"),
  S(1972, 'Carly Simon', "You're So Vain"),
  S(1998, 'Brandy & Monica', 'The Boy Is Mine'),
  S(1966, 'The Beach Boys', 'Good Vibrations'),
  S(2006, 'Amy Winehouse', 'Rehab'),
  S(1980, 'Kool & The Gang', 'Celebration'),
  S(1989, 'Gipsy Kings', 'Volare'),
  S(2016, 'Max Giesinger', '80 Millionen'),
  S(1978, 'Meat Loaf', 'Paradise By the Dashboard Light'),
  S(1958, 'Chuck Berry', 'Johnny B. Goode'),
  S(1996, 'Mark Morrison', 'Return of the Mack'),
  S(2021, 'Olivia Rodrigo', 'drivers license'),
  S(1970, 'The Kinks', 'Lola'),
  S(1964, 'Siw Malmkvist', 'Liebeskummer lohnt sich nicht'),
  S(2004, 'Eric Prydz', 'Call on Me'),
  S(1999, 'Fatboy Slim', 'Praise You'),
  S(1961, 'Elvis Presley', "Can't Help Falling in Love"),
  S(1977, 'Linda Ronstadt', 'Blue Bayou'),
];

const EDITIONEN = [
  ['Deutschland (Grundspiel)', 308, true], ['Schlagerparty', 308, false], ['Summer Party', 308, true], ['Guilty Pleasures', 308, true],
  ['Bingo', 226, false], ['Bayern 1', 154, false], ['Film & TV', 154, true], ['Rock', 308, true],
  ['Celebration', 308, false], ['Weihnachten', 154, false], ['Platinum', 500, false],
];

const ICH = 'p1';
const ZIEL = 10;

function neuesSpiel() {
  return {
    players: [
      { id: 'p1', name: 'Anna', host: true, connected: true, timeline: [...START.p1] },
      { id: 'p2', name: 'Jonas', host: false, connected: true, timeline: [...START.p2] },
      { id: 'p3', name: 'Mara', host: false, connected: true, timeline: [...START.p3] },
      { id: 'p4', name: 'Timo', host: false, connected: false, timeline: [...START.p4] },
    ],
    activeId: ICH,
    phase: 'turn', // turn | rollt | reveal
    card: { slot: null },
    round: 19,
    deck: [...STAPEL],
    deckLeft: 1214,
    log: [
      { p: 'p4', ok: false, song: S(1984, 'Nena', 'Irgendwie, irgendwo, irgendwann') },
      { p: 'p3', ok: true, song: START.p3[4] },
      { p: 'p2', ok: true, song: START.p2[1] },
      { p: 'p1', ok: true, song: START.p1[2] },
    ],
  };
}

// Jede Karte bekommt eine feste Farbe. Sie hängt am Jahr: Dieselbe Karte sieht bei
// allen gleich aus, und benachbarte Jahre bekommen deutlich verschiedene Farben
// (gleich sind nur Jahre im Abstand von 8).
const FARBEN = ['#dc7f97', '#4fada3', '#d6a83c', '#7f7ad8', '#dc7850', '#689fd6', '#a0b24f', '#cc77bd'];
const farbe = (song) => FARBEN[(song.y * 3) % FARBEN.length];

// Der Aufbau einer Karte (siehe stil.css): Schatten, Ring, Kante, Fläche mit Loch.
function karte(klasse, inhalt, marke) {
  return h('div', { class: `karte ${klasse}` },
    h('span', { class: 'k-schatten' }), h('span', { class: 'k-ring' }), h('span', { class: 'k-kante' }),
    h('div', { class: 'k-flaeche' }, h('span', { class: 'k-loch' }), inhalt),
    marke);
}

function richtigeLuecken(tl, y) {
  const out = [];
  for (let i = 0; i <= tl.length; i++) {
    if ((i === 0 || tl[i - 1].y <= y) && (i === tl.length || tl[i].y >= y)) out.push(i);
  }
  return out;
}

function lueckenText(tl, i) {
  const l = tl[i - 1]?.y;
  const r = tl[i]?.y;
  if (l === undefined && r === undefined) return 'Hier';
  if (l === undefined) return `Vor ${r}`;
  if (r === undefined) return `Nach ${l}`;
  return `Zwischen ${l} und ${r}`;
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Die Skala ────────────────────────────────────────────────────────────────
// Die Zeitleiste als Senderskala: Jede Songkarte hängt an einem Strich der Skala.
// Karten werden frei positioniert, damit Lücken weich aufgehen und die Karte im
// Spiel dorthin gleiten und landen kann.
//
// update({ stations, slot, mode, reveal })
//   mode: 'waehlen' (ich bin dran) | 'zuschauen' | 'offen' (aufgedeckt) | 'ruhe'
//   reveal: { song, correct, correctSlots } bei mode 'offen'

class Skala {
  constructor({ onSelect, onLock } = {}) {
    this.onSelect = onSelect || (() => {});
    this.onLock = onLock || (() => {});
    this.karten = new Map();
    this.view = { stations: [], slot: null, mode: 'ruhe', reveal: null };
    this.geom = null;
    this.zieht = null;
    this.ersteLage = true;
    this.gerollt = null;

    this.linie = h('div', { class: 'skala-linie' });
    this.lage = h('div', { class: 'skala-karten' });
    this.treffer = h('div', { class: 'skala-treffer' });
    this.geist = h('div', { class: 'geist' });
    // Zeigt nach einem Fehlgriff, wo die Karte hingehört hätte.
    this.geisterJahr = h('span', { class: 'g-jahr' });
    this.geisterkarte = h('div', { class: 'geisterkarte' }, this.geisterJahr, h('span', {}, 'hier wäre richtig gewesen'));

    this.ziffern = [0, 1, 2, 3].map(() => h('span', { class: 'rolle' }, ['?', 0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((z) => pixeltext(z))));
    this.kKuenstler = h('span', { class: 'k-kuenstler' });
    this.kTitel = h('span', { class: 'k-titel' });
    this.kachel = karte('kachel rueck', [
      h('div', { class: 'k-rueck' }, dino('steht'), pixeltext('????')),
      h('div', { class: 'k-vorn' },
        h('div', { class: 'k-jahr' }, h('span', { class: 'zaehler', 'aria-hidden': 'true' }, this.ziffern.map((r) => h('span', { class: 'ziffer' }, r)))),
        h('div', { class: 'k-text' }, this.kKuenstler, this.kTitel)),
    ], h('span', { class: 'k-marke schlecht' }, symbol('kreuz')));
    this.zeiger = h('div', { class: 'zeiger weg' }, h('div', { class: 'nadel' }), this.kachel);

    this.el = h('div', { class: 'skala' }, this.linie, this.lage, this.geisterkarte, this.treffer, this.geist, this.zeiger);

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
    document.removeEventListener('keydown', this.tasten);
    this.ro.disconnect();
  }

  update(view) {
    const vorher = this.view;
    this.view = { reveal: null, slot: null, ...view };
    const v = this.view;
    const waehlbar = v.mode === 'waehlen' || v.mode === 'zuschauen';
    const warWaehlbar = vorher.mode === 'waehlen' || vorher.mode === 'zuschauen';

    // Wo die Karte im Spiel gerade ist: Von dort fliegt sie in die Zeitleiste.
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
    const falsch = v.mode === 'offen' && v.reveal && !v.reveal.correct;
    if (falsch && this.gerollt !== v.reveal.song.id) {
      this.fuelleVorn(v.reveal.song);
      this.kachel.classList.remove('rueck');
      this.zeigeJahr(v.reveal.song.y, false);
    }
    if (waehlbar && !warWaehlbar) this.verdecke();
    this.kachel.classList.toggle('falsch', !!falsch);
    const z = this.zeiger.classList;
    z.toggle('falsch', !!falsch);
    z.toggle('greifbar', v.mode === 'waehlen');
    const weg = v.mode === 'ruhe' || (v.mode === 'offen' && !falsch);
    if (weg && landet) z.add('sofort');
    z.toggle('weg', weg);

    const flieger = landet ? this.karten.get(v.reveal.song.id) : null;
    this.layout(neue, flieger && von ? { el: flieger, von } : null);
    if (weg && landet) { void this.zeiger.offsetWidth; z.remove('sofort'); }

    // Neue Karten stehen schon an ihrem Platz und blenden jetzt ein.
    neue.forEach((el, i) => {
      if (el === flieger) return;
      void el.offsetWidth;
      el.style.transitionDelay = v.gestaffelt ? `${i * 55}ms` : '';
      el.classList.remove('kommt');
    });
  }

  // Die Karte dreht sich um, dann rasten die Ziffern auf das Jahr ein.
  async rolle(song) {
    this.fuelleVorn(song);
    this.gerollt = song.id;
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
    this.kKuenstler.textContent = song.a;
    this.kTitel.textContent = song.t;
  }

  zeigeJahr(jahr, animiert) {
    const text = String(jahr).padStart(4, '0');
    this.ziffern.forEach((r, i) => {
      const schritte = Number(text[i]) + 1;
      r.style.transition = animiert ? `transform ${0.3 + schritte * 0.055}s steps(${schritte}) ${i * 120}ms` : 'none';
      r.style.transform = `translateY(calc(var(--kp) * ${-9 * schritte}))`;
    });
  }

  verdecke() {
    this.gerollt = null;
    this.zeiger.classList.add('sofort');
    this.kachel.classList.add('rueck');
    this.kachel.classList.remove('falsch', 'dreht');
    this.ziffern.forEach((r) => { r.style.transition = 'none'; r.style.transform = 'translateY(0)'; });
    void this.zeiger.offsetWidth;
    this.zeiger.classList.remove('sofort');
  }

  layout(neue = [], flug = null) {
    const v = this.view;
    const W = this.el.clientWidth;
    if (!W) return;
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
    const w = Math.min(164, Math.max(88, (W - (plaetze + 1) * g) / plaetze));
    const total = plaetze * w + (plaetze + 1) * g;
    const start = Math.max(0, (W - total) / 2);
    const s = waehlbar ? v.slot : falsch ? v.reveal.correctSlots[0] : null;
    const schritt = w + g;

    // Kartenmaße: quadratisch, die Pixelgröße der Jahreszahl richtet sich nach der Breite.
    const wi = w - 6;
    const H = wi;
    const p = wi >= 151 ? 5 : wi >= 124 ? 4 : 3; // die Jahreszahl muss in den Innenrahmen passen
    const kopf = v.mode === 'ruhe' ? 16 : H + 36;
    const oben = kopf + 17;
    const st = this.el.style;
    st.setProperty('--kw', `${wi}px`);
    st.setProperty('--kh', `${H}px`);
    st.setProperty('--kp', `${p}px`);
    st.setProperty('--rp', `${p >= 4 ? 3 : 2}px`);
    st.setProperty('--kt', `${p >= 5 ? 13 : 12}px`);
    st.setProperty('--kopf', `${kopf}px`);
    st.height = `${oben + H + 10 + 12}px`;

    const xs = [];
    const mitten = [];
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
    const ruheStart = start + (waehlbar ? schritt / 2 : 0);
    const ruheMitte = (i) => ruheStart + g + i * schritt + w / 2;
    this.geom = { W, n, w, wi, H, oben, mitten, xs, ruheMitte };

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
          onclick: () => this.onSelect(i),
          onpointerenter: () => this.zeigeGeist(i),
          onpointerleave: () => this.zeigeGeist(null),
          onfocus: () => this.zeigeGeist(i),
          onblur: () => this.zeigeGeist(null),
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
    if (falsch) { geparkt = false; zx = mitten[v.slot ?? 0]; }
    else if (waehlbar && v.slot !== null) { geparkt = false; zx = mitten[v.slot]; }
    this.zeiger.classList.toggle('geparkt', geparkt);
    if (!this.zieht?.bewegt) this.setzeZeiger(zx);

    // „Hier wäre richtig gewesen“: eine grüne Geisterkarte am richtigen Platz.
    if (falsch) {
      const jahr = String(v.reveal.song.y);
      if (this.geisterJahr.dataset.jahr !== jahr) {
        this.geisterJahr.dataset.jahr = jahr;
        this.geisterJahr.replaceChildren(pixeltext(jahr));
      }
      this.geisterkarte.style.transform = `translate(${start + g + s * schritt + 3}px, 0)`;
    }
    this.geisterkarte.classList.toggle('da', falsch);

    if (sofort) { void this.zeiger.offsetWidth; this.zeiger.classList.remove('sofort'); }
  }

  setzeZeiger(x) {
    const { W, wi } = this.geom;
    const halb = wi / 2 + 3;
    const schub = Math.min(Math.max(x, halb), W - halb) - x;
    this.zeiger.style.transform = `translateX(${x}px)`;
    this.kachel.style.setProperty('--schub', `${schub}px`);
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
    this.el.append(f);
    setTimeout(() => f.remove(), 700);
  }

  zeigeGeist(i) {
    this.geistSlot = i;
    const an = i !== null && this.view.mode === 'waehlen' && i !== this.view.slot && !this.zieht;
    this.geist.classList.toggle('da', an);
    if (an) this.geist.style.transform = `translateX(${this.geom.mitten[i]}px)`;
  }

  slotBei(x) {
    let s = 0;
    for (let i = 0; i < this.geom.n; i++) if (this.geom.ruheMitte(i) < x) s = i + 1;
    return s;
  }

  greifen(e) {
    if (this.view.mode !== 'waehlen') return;
    this.zieht = { x0: e.clientX, bewegt: false };
    this.kachel.setPointerCapture(e.pointerId);
    this.zeigeGeist(null);
  }

  ziehen(e) {
    if (!this.zieht) return;
    if (Math.abs(e.clientX - this.zieht.x0) > 4) this.zieht.bewegt = true;
    if (!this.zieht.bewegt) return;
    const r = this.el.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - r.left, 0), this.geom.W);
    this.zeiger.classList.add('zieht');
    this.zeiger.classList.remove('geparkt');
    this.setzeZeiger(x);
    const s = this.slotBei(x);
    if (s !== this.view.slot) this.onSelect(s);
  }

  loslassen() {
    if (!this.zieht) return;
    this.zieht = null;
    this.zeiger.classList.remove('zieht');
    this.layout();
  }

  taste(e) {
    if (this.view.mode !== 'waehlen' || e.target.closest?.('input, #proto')) return;
    const n = this.view.stations.length;
    const s = this.view.slot;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      this.onSelect(s === null ? Math.floor((n + (d > 0 ? 1 : 0)) / 2) : Math.min(n, Math.max(0, s + d)));
    } else if (e.key === 'Enter' && s !== null && !e.target.closest?.('button')) {
      e.preventDefault();
      this.onLock();
    }
  }
}

// ── Gemeinsame Teile ─────────────────────────────────────────────────────────

function kopf(aktionLabel, onAktion, lage = null) {
  return h('header', { class: 'kopf' },
    lockup(),
    lage,
    h('span', { class: 'punkt-status' }, 'verbunden'),
    textknopf(aktionLabel, onAktion));
}

function setzeTitel(el, text, klasse = '') {
  const zeile = pixelzeile(text);
  const spalten = [...zeile.children].reduce((sum, s) => sum + Number(s.dataset.cols) + 4, 0);
  el.className = klasse;
  if (spalten > 150) el.style.setProperty('--p', '4px');
  else el.style.removeProperty('--p');
  el.replaceChildren(zeile);
}

function reihen(game, { sortiert = false } = {}) {
  const liste = sortiert ? [...game.players].sort((a, b) => b.timeline.length - a.timeline.length) : game.players;
  return h('ul', { class: 'reihen' }, liste.map((p) =>
    h('li', { class: `reihe${p.id === game.activeId ? ' dran' : ''}${p.connected ? '' : ' getrennt'}` },
      h('span', { class: 'wer' },
        h('span', { class: 'name' }, p.name),
        p.id === ICH ? h('span', { class: 'marke' }, 'du') : null,
        !p.connected ? h('span', { class: 'marke' }, 'getrennt') : null),
      h('span', { class: 'stand' }, pixeltext(`${p.timeline.length}/${ZIEL}`)),
      h('ol', { class: 'mini', 'aria-label': `Zeitleiste von ${p.name}` },
        Array.from({ length: Math.max(ZIEL, p.timeline.length) }, (_, i) =>
          p.timeline[i] ? h('li', {}, pixeltext(p.timeline[i].y)) : h('li', { class: 'leer', 'aria-hidden': 'true' }))))));
}

// ── Start ────────────────────────────────────────────────────────────────────

function startSeite() {
  const laeufer = h('div', { class: 'laeufer' }, dino('steht'));
  const deko = h('div', { class: 'dekoskala', 'aria-hidden': 'true' },
    h('div', { class: 'strich-linie' }),
    h('ol', {}, [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map((j) => h('li', {}, pixeltext(j)))),
    laeufer);
  const el = h('main', { class: 'seite start' },
    h('div', { class: 'start-inhalt' },
      h('h1', {}, wortmarke()),
      h('p', { class: 'unterzeile' }, 'Das Musik-Zeitleisten-Spiel für Freunde.'),
      h('form', { class: 'start-form', onsubmit: (e) => { e.preventDefault(); zeige('lobby'); } },
        h('label', { class: 'feld' }, h('span', { class: 'etikett' }, pixeltext('Dein Name')),
          h('input', { maxlength: 24, value: 'Anna', placeholder: 'z. B. Anna', autocomplete: 'nickname' })),
        h('button', { type: 'submit', class: 'knopf haupt' }, pixeltext('Spiel erstellen'))),
      h('p', { class: 'hinweis' }, 'Du wirst Host: Dein Tab muss während des Spiels offen bleiben.'),
      h('div', { class: 'gespeichert' },
        h('p', {}, h('span', { class: 'leise' }, 'Laufendes Spiel '), 'vor 12 Min. gespeichert, 4 Spieler'),
        textknopf('Fortsetzen', () => zeige('zug')),
        textknopf('Verwerfen', () => {}))),
    deko,
    h('p', { class: 'fuss' }, '3 340 Songs, davon 3 102 mit Spotify verknüpft. Songdaten: songseeker-hitster-playlists (MIT-Lizenz). Musik über Spotify.'));

  // Der Dino läuft auf der Skala der Maus hinterher, in ganzen Pixelschritten.
  let x = null;
  let ziel = null;
  let pose = 'steht';
  const stelle = (neu) => { if (neu !== pose) { pose = neu; laeufer.replaceChildren(dino(neu)); } };
  const bewege = (e) => {
    const r = deko.getBoundingClientRect();
    ziel = Math.min(Math.max(e.clientX - r.left, 60), r.width - 60);
  };
  const takt = setInterval(() => {
    if (x === null) {
      if (!deko.clientWidth) return;
      x = Math.round(deko.clientWidth * 0.62);
      ziel = x;
      laeufer.style.transform = `translateX(${x}px)`;
    }
    const d = ziel - x;
    if (Math.abs(d) < 10) return stelle('steht');
    x += Math.sign(d) * 10;
    laeufer.classList.toggle('links', d < 0);
    stelle(pose === 'hinten' ? 'vorn' : 'hinten');
    laeufer.style.transform = `translateX(${x}px)`;
  }, 110);
  window.addEventListener('pointermove', bewege);
  return { el, weg: () => { window.removeEventListener('pointermove', bewege); clearInterval(takt); } };
}

// ── Lobby ────────────────────────────────────────────────────────────────────

function lobbySeite() {
  const g = neuesSpiel();
  let karten = ZIEL;
  const ausgabe = h('output', {}, pixeltext(karten));
  const stell = (d) => { karten = Math.min(30, Math.max(2, karten + d)); ausgabe.replaceChildren(pixeltext(karten)); };

  const link = 'https://iterate-lemon.github.io/radino/#r=k7fq-2mxd-p9';
  const kopiert = h('span', { class: 'klein', role: 'status' });
  const kopieren = knopf('Link kopieren', () => {
    kopiert.textContent = 'Kopiert.';
    setTimeout(() => { kopiert.textContent = ''; }, 1800);
  });

  const abPunkte = ['Songanfang', 'Sekunde 30', 'Sekunde 60'];
  const segmente = h('div', { class: 'segmente', role: 'group', 'aria-label': 'Abspielen ab' },
    abPunkte.map((t, i) => h('button', {
      type: 'button', 'aria-pressed': String(i === 1),
      onclick: (e) => { for (const b of segmente.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); },
    }, t)));

  const modus = (wert, titel, text, an) => h('label', { class: 'wahl' },
    h('input', { type: 'radio', name: 'modus', value: wert, checked: an }),
    h('span', { class: 'knopfpunkt' }),
    h('span', {}, h('b', {}, titel), h('span', { class: 'text' }, text)));

  const titel = h('h1');
  setzeTitel(titel, 'Lobby');

  const el = h('div', { class: 'seite' },
    kopf('Raum schließen', () => zeige('start')),
    h('main', {},
      h('div', { class: 'ansage' }, h('div', { class: 'links' },
        titel,
        h('p', { class: 'unter' }, 'Lade deine Freunde ein und stell das Spiel ein.'))),
      h('div', { class: 'lobby-raster' },
        h('div', {},
          h('section', { class: 'block' },
            etikett('Einladen'),
            h('div', { class: 'linkzeile' }, h('input', { readonly: true, value: link, 'aria-label': 'Einladungslink', onfocus: (e) => e.target.select() }), kopieren),
            h('p', { class: 'klein' }, 'Wer den Link hat, kann beitreten. Gib ihn nur an Freunde. ', kopiert)),
          h('section', { class: 'block' },
            etikett(`Spieler · ${g.players.length}`),
            h('ul', { class: 'spieler' }, g.players.map((p) => h('li', { class: p.connected ? '' : 'getrennt' },
              h('span', { class: 'name' }, p.name),
              p.host ? h('span', { class: 'marke' }, 'Host') : null,
              p.id === ICH ? h('span', { class: 'marke' }, 'du') : null,
              p.host ? h('span', { class: 'punkt-status' }, 'Spotify bereit')
                : p.connected ? h('span', { class: 'punkt-status' }, 'verbunden')
                  : h('span', { class: 'punkt-status aus' }, 'getrennt'),
              !p.host ? textknopf('entfernen', () => {}) : null)))),
          h('section', { class: 'block' },
            etikett('Spotify'),
            h('div', { class: 'zeile' }, h('span', { class: 'punkt-status' }, 'Angemeldet, Player bereit'), textknopf('Abmelden', () => {})))),
        h('div', {},
          h('section', { class: 'block' },
            etikett('Musik'),
            modus('host', 'Nur der Host spielt ab', 'Die anderen hören über einen Discord-Stream mit. Beliebig viele Spieler.', true),
            modus('everyone', 'Jeder hört selbst', 'Jeder braucht Spotify Premium. Höchstens 5 Konten.', false)),
          h('section', { class: 'block' },
            etikett('Regeln'),
            h('div', { class: 'zeile' }, h('span', {}, 'Karten zum Sieg ', h('span', { class: 'leise' }, '(mit Startkarte)')),
              h('div', { class: 'zaehlwerk' },
                h('button', { type: 'button', 'aria-label': 'weniger', onclick: () => stell(-1) }, '−'), ausgabe,
                h('button', { type: 'button', 'aria-label': 'mehr', onclick: () => stell(1) }, '+'))),
            h('div', { class: 'zeile' }, h('span', {}, 'Abspielen ab'), segmente)),
          h('section', { class: 'block' },
            etikett('Editionen'),
            h('div', { class: 'editionen' }, EDITIONEN.map(([name, anzahl, an]) => h('label', { class: 'haken' },
              h('input', { type: 'checkbox', checked: an }),
              h('span', { class: 'kasten' }, symbol('haken')),
              h('span', { class: 'ename' }, name),
              h('span', { class: 'anzahl' }, anzahl))))))),
      h('div', { class: 'startleiste' },
        knopf('Spiel starten', () => zeige('zug'), 'haupt'),
        h('span', { class: 'leise' }, '4 Spieler · 1 386 Songs in der Auswahl'))));
  return { el };
}

// ── Spiel ────────────────────────────────────────────────────────────────────

function spielSeite(einstieg) {
  const g = neuesSpiel();
  const timer = [];
  const spaeter = (fn, ms) => timer.push(setTimeout(fn, ms));
  let maraRichtig = true;

  const titel = h('h1');
  const unterText = h('span');
  const lage = h('span', { class: 'lage' });
  const tonStatus = h('span', {}, 'läuft');
  const tonEl = h('div', { class: 'ton' },
    h('span', { class: 'ton-status' }, h('span', { class: 'pegel', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('i'))), tonStatus),
    textknopf('Nochmal', () => setzeTon(true)),
    textknopf('Stopp', () => setzeTon(false)),
    h('label', { class: 'lautstaerke' }, 'Lautstärke', h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: 0.7 })));
  const aktion = h('div', { class: 'aktion' });
  const reihenPlatz = h('div');
  const verlauf = h('ol', { class: 'verlauf' });

  const skala = new Skala({
    onSelect: (i) => { if (g.phase === 'turn' && g.activeId === ICH) { g.card.slot = i; zeichne(); } },
    onLock: () => festlegen(),
  });

  const el = h('div', { class: 'seite' },
    kopf('Raum schließen', () => zeige('start'), lage),
    h('main', {},
      h('div', { class: 'ansage' }, h('div', { class: 'links' }, titel, h('p', { class: 'unter' }, unterText)), tonEl),
      skala.el,
      aktion,
      h('div', { class: 'unten' },
        h('section', {}, etikett('Zeitleisten'), reihenPlatz),
        h('section', {}, etikett('Verlauf'), verlauf)),
      h('div', { class: 'hostleiste' },
        h('span', { class: 'etikett' }, pixeltext('Host')),
        textknopf('Einladungslink kopieren', () => {}),
        textknopf('Zug überspringen', () => {}),
        textknopf('Spiel beenden', () => zeige('ende')))));

  const spieler = (id) => g.players.find((p) => p.id === id);
  const aktiv = () => spieler(g.activeId);

  function setzeTon(an) {
    tonEl.classList.toggle('still', !an);
    tonStatus.textContent = an ? 'läuft' : 'angehalten';
  }

  function zeichne() {
    const a = aktiv();
    const ich = a.id === ICH;
    const c = g.card;
    const tl = a.timeline;

    if (g.phase === 'reveal') {
      const s = c.song;
      if (ich) setzeTitel(titel, c.correct ? 'Richtig!' : 'Leider falsch.', c.correct ? 'gut' : 'falsch');
      else setzeTitel(titel, `${a.name} liegt ${c.correct ? 'richtig!' : 'falsch.'}`, c.correct ? 'gut' : 'falsch');
      unterText.textContent = `${s.a} – ${s.t} ist von ${s.y}. ${c.correct ? 'Die Karte bleibt.' : 'Die Karte ist weg.'}`;
    } else {
      setzeTitel(titel, ich ? 'Du bist dran!' : `${a.name} ist dran.`);
      unterText.textContent = ich ? 'Wo gehört dieser Song in deine Zeitleiste?' : `Der Song wird in die Zeitleiste von ${a.name} eingeordnet.`;
    }
    lage.textContent = `Karte ${g.round}  ·  noch ${g.deckLeft.toLocaleString('de-DE')} im Stapel  ·  Ziel: ${ZIEL} Karten`;

    // Aktionszeile
    const teile = [];
    if (g.phase === 'reveal') {
      const gewonnen = tl.length >= ZIEL;
      teile.push(knopf(gewonnen ? 'Zum Ergebnis' : 'Weiter', weiter, 'haupt'));
      teile.push(h('span', { class: 'wo' }, gewonnen ? `${a.name} hat ${ZIEL} Karten.` : `Als Nächstes: ${spieler(naechster()).name}`));
    } else if (ich) {
      teile.push(knopf('Festlegen', festlegen, 'haupt', { disabled: c.slot === null || g.phase !== 'turn' }));
      teile.push(h('span', { class: 'wo' }, c.slot === null ? 'Wähle eine Lücke: klicken, die Karte ziehen oder ← →' : h('b', {}, lueckenText(tl, c.slot))));
      teile.push(h('div', { class: 'rechts' }, textknopf('Song überspringen', () => {})));
    } else {
      teile.push(h('span', { class: 'wo' }, c.slot === null ? `${a.name} überlegt …` : [`${a.name} zeigt auf: `, h('b', {}, lueckenText(tl, c.slot))]));
    }
    aktion.replaceChildren(...teile);

    reihenPlatz.replaceChildren(reihen(g));
    verlauf.replaceChildren(...g.log.slice(0, 5).map((e) => h('li', { class: e.ok ? 'ok' : 'nein' },
      symbol(e.ok ? 'haken' : 'kreuz'),
      h('span', {}, h('span', { class: 'wer' }, `${spieler(e.p).name} · `), `${e.song.a} – ${e.song.t} (${e.song.y})`))));

    skala.update({
      stations: tl,
      slot: c.slot,
      mode: g.phase === 'reveal' ? 'offen' : ich && g.phase === 'turn' ? 'waehlen' : 'zuschauen',
      reveal: g.phase === 'reveal' ? c : null,
    });
  }

  async function festlegen() {
    const c = g.card;
    if (g.phase !== 'turn' || c.slot === null) return;
    const a = aktiv();
    const song = g.deck.shift();
    const correctSlots = richtigeLuecken(a.timeline, song.y);
    g.card = { ...c, locked: true, song, correctSlots, correct: correctSlots.includes(c.slot) };
    g.phase = 'rollt';
    zeichne();
    await skala.rolle(song);
    if (g.card.correct) a.timeline.splice(c.slot, 0, song);
    g.log.unshift({ p: a.id, ok: g.card.correct, song });
    g.phase = 'reveal';
    zeichne();
  }

  const naechster = () => (g.activeId === ICH ? 'p3' : ICH);

  function weiter() {
    if (aktiv().timeline.length >= ZIEL) return zeige('ende');
    g.activeId = naechster();
    g.phase = 'turn';
    g.card = { slot: null };
    g.round += 1;
    g.deckLeft -= 1;
    if (!g.deck.length) g.deck = [...STAPEL];
    zeichne();
    if (g.activeId !== ICH) maraSpielt();
  }

  // Mara „spielt“: ein kleines Drehbuch, damit man das Zuschauen beurteilen kann.
  function maraSpielt() {
    const a = aktiv();
    const richtig = richtigeLuecken(a.timeline, g.deck[0].y);
    const n = a.timeline.length;
    const daneben = richtig[0] > 0 ? richtig[0] - 1 : richtig[richtig.length - 1] + 1;
    const ziel = maraRichtig ? richtig[0] : daneben;
    maraRichtig = !maraRichtig;
    const zeigeAuf = (i) => () => { if (g.phase === 'turn' && g.activeId !== ICH) { g.card.slot = i; zeichne(); } };
    spaeter(zeigeAuf(Math.min(n, richtig[0] + 2)), 1500);
    spaeter(zeigeAuf(daneben), 3000);
    spaeter(zeigeAuf(ziel), 4400);
    spaeter(() => { if (g.activeId !== ICH) festlegen(); }, 5900);
  }

  // Einstieg je nach gewähltem Zustand
  if (einstieg === 'zuschauen') {
    g.activeId = 'p3';
    zeichne();
    maraSpielt();
  } else {
    zeichne();
    if (einstieg === 'richtig' || einstieg === 'falsch') {
      const richtig = richtigeLuecken(aktiv().timeline, g.deck[0].y);
      const slot = einstieg === 'richtig' ? richtig[0] : richtig[0] + 2;
      spaeter(() => { g.card.slot = slot; zeichne(); }, 600);
      spaeter(festlegen, 1500);
    }
  }

  return { el, weg: () => { timer.forEach(clearTimeout); skala.entfernen(); } };
}

// ── Spielende ────────────────────────────────────────────────────────────────

function endeSeite() {
  const g = neuesSpiel();
  g.activeId = null;
  const mara = g.players[2];
  mara.timeline = [...START.p3, STAPEL[13], STAPEL[8], STAPEL[2], STAPEL[7]].sort((a, b) => a.y - b.y);
  g.players[0].timeline = [...START.p1, STAPEL[0], STAPEL[1], STAPEL[4], STAPEL[6]].sort((a, b) => a.y - b.y);
  g.players[1].timeline = [...START.p2, STAPEL[3], STAPEL[10]].sort((a, b) => a.y - b.y);

  const titel = h('h1');
  setzeTitel(titel, `${mara.name} gewinnt!`, 'gut');
  const skala = new Skala();
  const el = h('div', { class: 'seite ende' },
    kopf('Raum schließen', () => zeige('start')),
    h('main', {},
      h('div', { class: 'ansage' },
        h('div', { class: 'links' }, titel, h('p', { class: 'unter' }, `${ZIEL} Karten nach 41 Runden. Das ist die Zeitleiste:`)),
        dino('steht', 'sieger-dino')),
      skala.el,
      h('div', { class: 'aktion' },
        knopf('Neues Spiel', () => zeige('lobby'), 'haupt'),
        h('span', { class: 'wo' }, 'Zurück in die Lobby, alle bleiben im Raum.')),
      h('div', { class: 'unten' },
        h('section', {}, etikett('Endstand'), reihen(g, { sortiert: true })))));
  setTimeout(() => skala.update({ stations: mara.timeline, mode: 'ruhe', gestaffelt: true }), 60);
  return { el, weg: () => skala.entfernen() };
}

// ── Umschalten ───────────────────────────────────────────────────────────────

const ZUSTAENDE = [
  ['start', 'Start', startSeite],
  ['lobby', 'Lobby', lobbySeite],
  ['zug', 'Zug', () => spielSeite('zug')],
  ['zuschauen', 'Zuschauen', () => spielSeite('zuschauen')],
  ['richtig', 'Aufdecken ✓', () => spielSeite('richtig')],
  ['falsch', 'Aufdecken ✕', () => spielSeite('falsch')],
  ['ende', 'Ende', endeSeite],
];

const app = document.getElementById('app');
const proto = document.getElementById('proto');
let aktuell = null;

function zeige(id) {
  const eintrag = ZUSTAENDE.find((z) => z[0] === id) || ZUSTAENDE[0];
  aktuell?.weg?.();
  aktuell = eintrag[2]();
  app.replaceChildren(aktuell.el);
  window.scrollTo(0, 0);
  history.replaceState(null, '', `#${eintrag[0]}`);
  for (const b of proto.querySelectorAll('button')) b.setAttribute('aria-current', String(b.dataset.id === eintrag[0]));
}

proto.append(h('span', {}, 'Prototyp'), ...ZUSTAENDE.map(([id, label]) => h('button', { type: 'button', 'data-id': id, onclick: () => zeige(id) }, label)));
window.addEventListener('hashchange', () => zeige(location.hash.slice(1)));
zeige(location.hash.slice(1) || 'start');
