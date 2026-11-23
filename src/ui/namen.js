// Namensvorschläge für die Startseite: eine Eigenschaft plus ein Hauptwort, z. B.
// „Verkaterter Gartenzwerg“, „Panierte Moorleiche“, „Verbeamtetes Furzkissen“.
// Die Wörter sollen nur lustig sein, gern schräg und ein bisschen frech: Körperliches,
// Spießiges, Gruseliges, Essen. Mit Musik oder dem Spiel haben sie nichts zu tun.
// Grenze: nichts Sexuelles, keine Drogen, nichts gegen echte Menschengruppen.
//
// Ohne Artikel bekommt die Eigenschaft die starke Endung: -er (der), -e (die), -es (das).
// Deshalb stehen hier nur Eigenschaften, die diese Endungen ohne Änderung annehmen
// (nicht „dunkel“ → „dunkler“ oder „müde“ → „müder“).

/** Höchstlänge eines Namens (LIMITS.nameLength in src/core/game.js). */
export const NAME_MAX = 24;

export const EIGENSCHAFTEN = [
  // Körper und Geruch
  'pupsend', 'rülpsend', 'sabbernd', 'schwitzend', 'schmatzend', 'grunzend', 'kreischend', 'schnarchend',
  'ungeduscht', 'unrasiert', 'verlaust', 'stinkend', 'müffelnd', 'ranzig', 'vergammelt', 'schimmelig',
  'schleimig', 'glitschig', 'klebrig', 'haarig', 'warzig', 'nackt', 'halbnackt', 'tätowiert', 'zahnlos',
  // Zustand und Charakter
  'verkatert', 'beschwipst', 'angeheitert', 'durchgeknallt', 'bekloppt', 'wahnsinnig', 'hemmungslos', 'zügellos',
  'größenwahnsinnig', 'selbstverliebt', 'eingebildet', 'nachtragend', 'beleidigt', 'eifersüchtig', 'verbittert', 'verpeilt',
  'verfressen', 'dekadent', 'gescheitert', 'abgehalftert', 'verlottert', 'unberechenbar', 'hirnlos', 'kopflos',
  // Amtlich und spießig
  'vorbestraft', 'verschuldet', 'korrupt', 'bestechlich', 'flüchtig', 'zwielichtig', 'dubios', 'illegal',
  'verbeamtet', 'unkündbar', 'geschieden', 'pensioniert',
  // Gruselig und kosmisch
  'verflucht', 'besessen', 'untot', 'mutiert', 'radioaktiv', 'verstrahlt', 'hochexplosiv', 'kosmisch',
  // Wie aus der Küche
  'paniert', 'frittiert', 'gegrillt', 'eingelegt', 'geräuchert', 'überbacken', 'glasiert', 'abgelaufen',
  // Sonstiges Unpassendes
  'aufblasbar', 'jodelnd', 'sprechend', 'heulend', 'wimmernd', 'tanzend', 'fliegend',
];

// Hauptwörter nach Geschlecht: m = der, f = die, n = das
export const HAUPTWOERTER = {
  m: [
    'Toaster', 'Gartenzwerg', 'Wackelpudding', 'Nacktmull', 'Grottenolm', 'Axolotl', 'Popel', 'Fußpilz', 'Mettigel', 'Zehennagel',
    'Bauchnabel', 'Bierbauch', 'Furz', 'Schweinehund', 'Gerichtsvollzieher', 'Steuerberater', 'Hausmeister', 'Bademeister', 'Elternabend', 'Bausparvertrag',
    'Leberkäse', 'Kartoffelsalat', 'Rollator', 'Vokuhila', 'Schnauzbart', 'Seitenscheitel', 'Schlüpfer', 'Pantoffel', 'Gummistiefel', 'Weichspüler',
    'Heizpilz', 'Klappstuhl', 'Kronleuchter', 'Mops', 'Dackel', 'Waschbär', 'Kugelfisch', 'Lurch', 'Zombie', 'Vampir',
    'Werwolf', 'Yeti', 'Troll', 'Kobold', 'Hausgeist', 'Spießer', 'Wutbürger', 'Influencer', 'Bürokrat', 'Sachbearbeiter',
    'Kegelverein', 'Staubsauger', 'Kühlschrank', 'Pfannenwender', 'Zwieback', 'Knödel', 'Flamingo', 'Pinguin', 'Kaktus', 'Brokkoli',
  ],
  f: [
    'Klobürste', 'Leberwurst', 'Teewurst', 'Presswurst', 'Currywurst', 'Frikadelle', 'Schwiegermutter', 'Seegurke', 'Nacktschnecke', 'Kakerlake',
    'Zecke', 'Warze', 'Unterhose', 'Achselhöhle', 'Kloschüssel', 'Pfandflasche', 'Heizdecke', 'Kaffeefahrt', 'Schweinshaxe', 'Bratensoße',
    'Moorleiche', 'Blindschleiche', 'Wühlmaus', 'Ratte', 'Taube', 'Qualle', 'Ziege', 'Kröte', 'Dauerwelle', 'Zahnspange',
    'Jogginghose', 'Fußmatte', 'Steuererklärung', 'Dönerbude', 'Discokugel', 'Lavalampe', 'Gießkanne', 'Badewanne', 'Mikrowelle', 'Gurke',
    'Kartoffel', 'Banane', 'Socke', 'Giraffe', 'Avocado', 'Gans',
  ],
  n: [
    'Furzkissen', 'Mettbrötchen', 'Wurstbrot', 'Fischstäbchen', 'Hackfleisch', 'Eisbein', 'Kotelett', 'Schnitzel', 'Gebiss', 'Toupet',
    'Hörgerät', 'Hühnerauge', 'Achselhaar', 'Nasenhaar', 'Ohrläppchen', 'Ordnungsamt', 'Finanzamt', 'Dixiklo', 'Wasserbett', 'Sparschwein',
    'Kuscheltier', 'Sumpfmonster', 'Gespenst', 'Alien', 'Schnabeltier', 'Faultier', 'Stinktier', 'Nilpferd', 'Erdmännchen', 'Frettchen',
    'Opossum', 'Alpaka', 'Walross', 'Schwein', 'Ferkel', 'Huhn', 'Einhorn', 'Gummibärchen', 'Spiegelei', 'Bügeleisen',
    'Raclette', 'Fondue', 'Krokodil', 'Meerschweinchen',
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
