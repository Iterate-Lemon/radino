// Namensvorschläge für die Startseite: eine Eigenschaft plus ein Hauptwort, z. B.
// „Tanzender Toaster“, „Tanzende Tomate“, „Tanzendes Telefon“.
// Die Wörter sollen nur lustig sein, mit Musik oder dem Spiel haben sie nichts zu tun.
//
// Ohne Artikel bekommt die Eigenschaft die starke Endung: -er (der), -e (die), -es (das).
// Deshalb stehen hier nur Eigenschaften, die diese Endungen ohne Änderung annehmen
// (nicht „dunkel“ → „dunkler“ oder „müde“ → „müder“).

/** Höchstlänge eines Namens (LIMITS.nameLength in src/core/game.js). */
export const NAME_MAX = 24;

export const EIGENSCHAFTEN = [
  'tanzend', 'schlafend', 'flauschig', 'verwirrt', 'mutig', 'kichernd', 'hüpfend', 'wackelnd',
  'grummelig', 'knusprig', 'glitzernd', 'verträumt', 'frech', 'neugierig', 'zappelig', 'pummelig',
  'beleidigt', 'verschlafen', 'gemütlich', 'fliegend', 'schwebend', 'kitzlig', 'heimlich', 'würdevoll',
  'sportlich', 'dramatisch', 'schüchtern', 'gähnend', 'schnarchend', 'quietschend', 'schlotternd', 'zerzaust',
  'verliebt', 'wütend', 'fröhlich', 'grimmig', 'mürrisch', 'nervös', 'lässig', 'vornehm',
  'tapfer', 'zerstreut', 'mysteriös', 'elegant', 'hungrig', 'gestreift', 'gepunktet', 'kariert',
  'verbeult', 'klebrig', 'wuschelig', 'pfiffig', 'listig', 'flink', 'höflich', 'schick',
  'flott', 'kugelrund', 'winzig', 'riesig', 'magisch', 'launisch', 'galaktisch', 'königlich',
  'berühmt', 'verschnupft', 'leuchtend', 'brummend', 'watschelnd', 'schielend', 'stolpernd', 'jonglierend',
  'grübelnd',
];

// Hauptwörter nach Geschlecht: m = der, f = die, n = das
export const HAUPTWOERTER = {
  m: [
    'Toaster', 'Pinguin', 'Kaktus', 'Waschbär', 'Igel', 'Keks', 'Pudding', 'Staubsauger', 'Koala', 'Hamster',
    'Schneemann', 'Gartenzwerg', 'Brokkoli', 'Elch', 'Dackel', 'Pfannkuchen', 'Kühlschrank', 'Tintenfisch', 'Rasenmäher', 'Turnschuh',
    'Blumenkohl', 'Seehund', 'Maulwurf', 'Schnurrbart', 'Wombat', 'Hummer', 'Zwieback', 'Marienkäfer', 'Wackelpudding', 'Kürbis',
    'Teppich', 'Regenschirm', 'Bagger', 'Frosch', 'Kobold', 'Ritter', 'Pirat', 'Zauberer', 'Roboter', 'Astronaut',
    'Yeti', 'Flamingo', 'Papagei', 'Otter', 'Biber', 'Muffin', 'Knödel', 'Lebkuchen', 'Löffel', 'Schneebesen',
  ],
  f: [
    'Tomate', 'Gurke', 'Giraffe', 'Kartoffel', 'Banane', 'Ente', 'Socke', 'Waffel', 'Brezel', 'Qualle',
    'Schnecke', 'Wurst', 'Zahnbürste', 'Ananas', 'Kokosnuss', 'Möhre', 'Avocado', 'Gießkanne', 'Badewanne', 'Mikrowelle',
    'Teekanne', 'Erdbeere', 'Schildkröte', 'Nudel', 'Kuh', 'Eule', 'Mütze', 'Zitrone', 'Melone', 'Pflaume',
    'Rakete', 'Hummel', 'Ziege', 'Robbe', 'Krabbe', 'Kröte', 'Pizza', 'Bratwurst', 'Lampe', 'Gabel',
    'Taschenlampe', 'Gans', 'Katze', 'Maus', 'Rübe', 'Zwiebel', 'Laterne',
  ],
  n: [
    'Telefon', 'Nilpferd', 'Erdmännchen', 'Faultier', 'Krokodil', 'Schnitzel', 'Sofa', 'Kamel', 'Alpaka', 'Wiesel',
    'Gürteltier', 'Croissant', 'Eichhörnchen', 'Spiegelei', 'Bügeleisen', 'Waffeleisen', 'Murmeltier', 'Lama', 'Gummibärchen', 'Kissen',
    'Trampolin', 'Raumschiff', 'Einhorn', 'Schaf', 'Känguru', 'Brötchen', 'Fahrrad', 'Würstchen', 'Walross', 'Schwein',
    'Huhn', 'Pony', 'Zebra', 'Gespenst', 'Marzipan', 'Sandwich', 'Omelett', 'Nashorn', 'Seepferdchen', 'Opossum',
    'Frettchen',
  ],
};

export const ENDUNG = { m: 'er', f: 'e', n: 'es' };

const HAUPT = Object.entries(HAUPTWOERTER).flatMap(([geschlecht, woerter]) => woerter.map((wort) => ({ wort, geschlecht })));

/** Eigenschaft und Hauptwort zu einem Namen zusammensetzen, mit passender Endung. */
export function baueName(eigenschaft, wort, geschlecht) {
  const e = eigenschaft + ENDUNG[geschlecht];
  return `${e[0].toUpperCase()}${e.slice(1)} ${wort}`;
}

/**
 * Ein zufälliger Name. Lange Eigenschaften bekommen nur Hauptwörter, mit denen der Name
 * in NAME_MAX Zeichen passt. `ausser` (z. B. der bisherige Vorschlag) kommt nicht noch einmal.
 */
export function zufallsName(zufall = Math.random, ausser = null) {
  const wahl = (liste) => liste[Math.floor(zufall() * liste.length) % liste.length];
  let name = null;
  for (let versuch = 0; versuch < 20 && (name === null || name === ausser); versuch++) {
    const eigenschaft = wahl(EIGENSCHAFTEN);
    const passend = HAUPT.filter((h) => baueName(eigenschaft, h.wort, h.geschlecht).length <= NAME_MAX);
    const h = wahl(passend);
    name = baueName(eigenschaft, h.wort, h.geschlecht);
  }
  return name;
}
