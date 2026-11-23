// Pixel-Bausteine für RaDino: eine eigene Pixelschrift (Großbuchstaben, Ziffern),
// das Dino-Maskottchen und kleine Symbole. Alles wird als SVG aus Rechtecken
// gezeichnet, also gestochen scharf in jeder Größe und ohne fremde Dateien.

const NS = 'http://www.w3.org/2000/svg';

// ── Schrift: 7 Zeilen hoch, Stämme 2 Pixel breit ─────────────────────────────

const ZEICHEN = {
  A: ['.####.', '##..##', '##..##', '######', '##..##', '##..##', '##..##'],
  B: ['#####.', '##..##', '##..##', '#####.', '##..##', '##..##', '#####.'],
  C: ['.####.', '##..##', '##....', '##....', '##....', '##..##', '.####.'],
  D: ['####..', '##.##.', '##..##', '##..##', '##..##', '##.##.', '####..'],
  E: ['######', '##....', '##....', '#####.', '##....', '##....', '######'],
  F: ['######', '##....', '##....', '#####.', '##....', '##....', '##....'],
  G: ['.####.', '##..##', '##....', '##.###', '##..##', '##..##', '.####.'],
  H: ['##..##', '##..##', '##..##', '######', '##..##', '##..##', '##..##'],
  I: ['####', '.##.', '.##.', '.##.', '.##.', '.##.', '####'],
  J: ['....##', '....##', '....##', '....##', '##..##', '##..##', '.####.'],
  K: ['##..##', '##.##.', '####..', '###...', '####..', '##.##.', '##..##'],
  L: ['##....', '##....', '##....', '##....', '##....', '##....', '######'],
  M: ['##...##', '###.###', '#######', '##.#.##', '##...##', '##...##', '##...##'],
  N: ['##..##', '###.##', '###.##', '##.###', '##.###', '##..##', '##..##'],
  O: ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  P: ['#####.', '##..##', '##..##', '#####.', '##....', '##....', '##....'],
  Q: ['.####.', '##..##', '##..##', '##..##', '##.###', '.####.', '....##'],
  R: ['#####.', '##..##', '##..##', '#####.', '####..', '##.##.', '##..##'],
  S: ['.####.', '##..##', '##....', '.####.', '....##', '##..##', '.####.'],
  T: ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  U: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  V: ['##..##', '##..##', '##..##', '##..##', '##..##', '.####.', '..##..'],
  W: ['##...##', '##...##', '##...##', '##.#.##', '#######', '###.###', '##...##'],
  X: ['##..##', '##..##', '.####.', '..##..', '.####.', '##..##', '##..##'],
  Y: ['##..##', '##..##', '.####.', '..##..', '..##..', '..##..', '..##..'],
  Z: ['######', '....##', '...##.', '..##..', '.##...', '##....', '######'],
  0: ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  1: ['..##..', '.###..', '..##..', '..##..', '..##..', '..##..', '.####.'],
  2: ['.####.', '##..##', '....##', '..###.', '.##...', '##....', '######'],
  3: ['.####.', '##..##', '....##', '..###.', '....##', '##..##', '.####.'],
  4: ['...###', '..####', '.##.##', '##..##', '######', '....##', '....##'],
  5: ['######', '##....', '#####.', '....##', '....##', '##..##', '.####.'],
  6: ['.####.', '##....', '#####.', '##..##', '##..##', '##..##', '.####.'],
  7: ['######', '....##', '...##.', '..##..', '..##..', '..##..', '..##..'],
  8: ['.####.', '##..##', '##..##', '.####.', '##..##', '##..##', '.####.'],
  9: ['.####.', '##..##', '##..##', '.#####', '....##', '....##', '.####.'],
  '?': ['.####.', '##..##', '....##', '...##.', '..##..', '......', '..##..'],
  '!': ['##', '##', '##', '##', '##', '..', '##'],
  '.': ['..', '..', '..', '..', '..', '##', '##'],
  ',': ['..', '..', '..', '..', '..', '##', '.#'],
  ':': ['..', '##', '##', '..', '##', '##', '..'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '–': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '/': ['....##', '....##', '...##.', '..##..', '.##...', '##....', '##....'],
  '·': ['..', '..', '..', '##', '..', '..', '..'],
  "'": ['##', '##', '..', '..', '..', '..', '..'],
  '+': ['......', '..##..', '..##..', '######', '..##..', '..##..', '......'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
};
const UMLAUT = { Ä: 'A', Ö: 'O', Ü: 'U' };
const UNBEKANNT = ['####', '#..#', '#..#', '#..#', '#..#', '#..#', '####'];

function pfadAus(zeilen, x0, y0) {
  let d = '';
  zeilen.forEach((zeile, y) => {
    let x = 0;
    while (x < zeile.length) {
      if (zeile[x] !== '#') { x += 1; continue; }
      let e = x;
      while (zeile[e] === '#') e += 1;
      d += `M${x0 + x} ${y0 + y}h${e - x}v1h${x - e}z`;
      x = e;
    }
  });
  return d;
}

// Ein Stück Text in Pixelschrift. Die Pixelgröße kommt aus der CSS-Variable --p.
export function pixeltext(text, klasse = '') {
  const roh = String(text).toLocaleUpperCase('de-DE');
  const hoch = /[ÄÖÜ]/.test(roh);
  const y0 = hoch ? 2 : 0;
  let x = 0;
  let d = '';
  for (const z of roh) {
    const basis = UMLAUT[z];
    const zeilen = ZEICHEN[basis || z] || UNBEKANNT;
    d += pfadAus(zeilen, x, y0);
    if (basis) d += pfadAus(['##..##'], x, 0);
    x += zeilen[0].length + 1;
  }
  const breite = Math.max(1, x - 1);
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${breite} ${7 + y0}`);
  s.setAttribute('class', `px ${klasse}`.trim());
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', String(text));
  s.style.setProperty('--cols', breite);
  s.style.setProperty('--rows', 7 + y0);
  s.dataset.cols = breite;
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  s.append(p);
  return s;
}

// Mehrere Wörter, die als Zeile umbrechen dürfen (für Überschriften).
export function pixelzeile(text, klasse = '') {
  const el = document.createElement('span');
  el.className = `pz ${klasse}`.trim();
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', String(text));
  for (const wort of String(text).split(/\s+/).filter(Boolean)) {
    const s = pixeltext(wort);
    s.removeAttribute('role');
    s.setAttribute('aria-hidden', 'true');
    el.append(s);
  }
  return el;
}

// ── Symbole (einfarbig, Farbe über currentColor) ─────────────────────────────

const SYMBOLE = {
  haken: ['......##', '.....##.', '##..##..', '.####...', '..##....'],
  kreuz: ['##...##', '.##.##.', '..###..', '.##.##.', '##...##'],
};

export function symbol(name) {
  const zeilen = SYMBOLE[name];
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${zeilen[0].length} ${zeilen.length}`);
  s.setAttribute('class', 'symbol');
  s.setAttribute('aria-hidden', 'true');
  s.style.setProperty('--cols', zeilen[0].length);
  s.style.setProperty('--rows', zeilen.length);
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', pfadAus(zeilen, 0, 0));
  s.append(p);
  return s;
}

// ── Sprites ──────────────────────────────────────────────────────────────────

function sprite(zeilen, farben, klasse) {
  const breite = zeilen[0].length;
  for (const z of zeilen) if (z.length !== breite) console.warn('Sprite-Zeile hat falsche Länge:', z, z.length);
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${breite} ${zeilen.length}`);
  s.setAttribute('class', `sprite ${klasse}`.trim());
  s.setAttribute('aria-hidden', 'true');
  s.style.setProperty('--cols', breite);
  s.style.setProperty('--rows', zeilen.length);
  for (const [zeichen, farbe] of Object.entries(farben)) {
    const maske = zeilen.map((z) => [...z].map((c) => (c === zeichen ? '#' : '.')).join(''));
    const d = pfadAus(maske, 0, 0);
    if (!d) continue;
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', farbe);
    s.append(p);
  }
  return s;
}

const DINO_FARBEN = {
  o: '#12301f', // Kontur
  g: '#55b25c', // Grün
  G: '#2f8249', // Schatten
  l: '#9ddc7e', // Licht
  b: '#f0e6b4', // Bauch
  w: '#fffbe6', // Auge
  e: '#12301f', // Pupille
};

const DINO_OBEN = [
  '...............oooooo...',
  '..............olllgggo..',
  '..............oggggwego.',
  '..............oggggggggo',
  '..............ogggggoooo',
  '...............ogGgo....',
  '...............ogGgo....',
  '...............ogGgo....',
  '......oooooooooggGgo....',
  '....oollllllllllggGo....',
  '...olgggGggggGgggGGo....',
  '..olggggggGggggggGGo....',
  'oooggggggggggggggGo.....',
  'oGGGGGggggbbbbbbGGo.....',
  '.ooooooGGGbbbbbGGo......',
  '......oggGooooogGGo.....',
];
const DINO_BEINE = {
  steht: ['......oggGo...ogGGo.....', '......oggGo...ogGGo.....', '......ooooo...ooooo.....'],
  hinten: ['......oggGo...ogGGo.....', '......ooooo...ogGGo.....', '..............ooooo.....'],
  vorn: ['......oggGo...ogGGo.....', '......oggGo...ooooo.....', '......ooooo.............'],
};

// haltung: 'steht' | 'hinten' | 'vorn' (welches Bein gerade angehoben ist)
export function dino(haltung = 'steht', klasse = '') {
  return sprite([...DINO_OBEN, ...DINO_BEINE[haltung]], DINO_FARBEN, `dino ${klasse}`.trim());
}
