// Namensvorschläge für die Startseite: eine Eigenschaft plus ein Hauptwort, z. B.
// „Verkaterter Gartenzwerg“, „Panierte Moorleiche“, „Verbeamtetes Furzkissen“.
// Langweiliges (Toaster, Pinguin, Gießkanne) fliegt raus: Jedes Wort soll schon allein lustig sein.
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
  'triefend', 'tropfend', 'ungeduscht', 'unrasiert', 'verschwitzt', 'verlaust', 'stinkend', 'müffelnd',
  'ranzig', 'vergammelt', 'schimmelig', 'schleimig', 'glitschig', 'eitrig', 'fettig', 'speckig',
  'käsig', 'schuppig', 'haarig', 'behaart', 'warzig', 'schwabbelig', 'wabbelig', 'zahnlos',
  'nackt', 'halbnackt', 'tätowiert',
  // Zustand und Charakter
  'verkatert', 'beschwipst', 'angeheitert', 'hackedicht', 'durchgeknallt', 'bekloppt', 'wahnsinnig', 'hysterisch',
  'cholerisch', 'neurotisch', 'paranoid', 'esoterisch', 'größenwahnsinnig', 'selbstverliebt', 'rechthaberisch', 'missgünstig',
  'nachtragend', 'eifersüchtig', 'verbittert', 'verpeilt', 'verfressen', 'dekadent', 'hemmungslos', 'zügellos',
  'skrupellos', 'gnadenlos', 'ahnungslos', 'planlos', 'hirnlos', 'kopflos', 'arbeitsscheu', 'gescheitert',
  'abgehalftert', 'verlottert', 'unberechenbar', 'spießig', 'kleinkariert',
  // Amtlich und spießig
  'vorbestraft', 'polizeibekannt', 'gemeingefährlich', 'verschuldet', 'insolvent', 'gepfändet', 'abgemahnt', 'suspendiert',
  'beurlaubt', 'steuerpflichtig', 'meldepflichtig', 'korrupt', 'bestechlich', 'flüchtig', 'zwielichtig', 'dubios',
  'illegal', 'verbeamtet', 'unkündbar', 'geschieden', 'pensioniert',
  // Gruselig und kosmisch
  'verflucht', 'verhext', 'besessen', 'untot', 'wiedergeboren', 'ausgestopft', 'einbalsamiert', 'mumifiziert',
  'mutiert', 'radioaktiv', 'verstrahlt', 'hochexplosiv',
  // Wie aus der Küche
  'paniert', 'frittiert', 'flambiert', 'püriert', 'gedünstet', 'geräuchert', 'eingelegt', 'überbacken',
  'tiefgefroren', 'aufgewärmt', 'angebrannt', 'vakuumiert', 'abgelaufen', 'vegan', 'glutenfrei', 'koffeinfrei',
  // Wie aus dem Prospekt
  'aufblasbar', 'beheizt', 'ferngesteuert', 'tiefergelegt', 'frisiert', 'geleast', 'gebraucht', 'generalüberholt',
  'handgeklöppelt', 'limitiert', 'barrierefrei', 'wasserdicht',
  // Sonstiges Unpassendes
  'jodelnd', 'sprechend', 'wimmernd',
];

// Hauptwörter nach Geschlecht: m = der, f = die, n = das
export const HAUPTWOERTER = {
  m: [
    // Körper
    'Popel', 'Pickel', 'Furz', 'Fußpilz', 'Nagelpilz', 'Schweißfuß', 'Zahnstein', 'Mundgeruch', 'Hexenschuss', 'Leberfleck',
    'Zehennagel', 'Bauchnabel', 'Bierbauch', 'Bandwurm', 'Schweinehund',
    // Spießig und amtlich
    'Gartenzwerg', 'Jägerzaun', 'Laubbläser', 'Rasensprenger', 'Grillmeister', 'Schrebergarten', 'Stammtisch', 'Kegelverein', 'Elternabend', 'Bausparvertrag',
    'Strafzettel', 'Mahnbescheid', 'Gerichtsvollzieher', 'Steuerberater', 'Hausmeister', 'Bademeister', 'Schornsteinfeger', 'Kontrolleur', 'Sachbearbeiter', 'Bürokrat',
    'Spießer', 'Wutbürger', 'Influencer', 'Vokuhila', 'Schnauzbart', 'Seitenscheitel', 'Schlüpfer', 'Pantoffel', 'Rollator',
    // Essen
    'Mettigel', 'Rollmops', 'Wackelpudding', 'Leberkäse', 'Kartoffelsalat', 'Wurstsalat', 'Pansen',
    // Getier und Grusel
    'Nacktmull', 'Grottenolm', 'Axolotl', 'Blobfisch', 'Lurch', 'Zombie', 'Vampir', 'Werwolf', 'Poltergeist', 'Dämon',
    'Sensenmann', 'Yeti', 'Troll', 'Kobold',
  ],
  f: [
    // Körper
    'Warze', 'Hornhaut', 'Krampfader', 'Achselhöhle', 'Darmflora', 'Blähung', 'Glatze', 'Halbglatze', 'Dauerwelle', 'Föhnfrisur',
    'Zahnspange', 'Unterhose', 'Jogginghose', 'Bauchtasche', 'Funktionsjacke',
    // Spießig und amtlich
    'Schwiegermutter', 'Hausordnung', 'Kehrwoche', 'Mülltrennung', 'Steuererklärung', 'Abmahnung', 'Kaffeefahrt', 'Kaffeetafel', 'Polonaise', 'Schrankwand',
    'Eckbank', 'Hollywoodschaukel', 'Raufasertapete', 'Häkeldecke', 'Heizdecke', 'Fußmatte', 'Thermoskanne', 'Tupperdose', 'Discokugel', 'Lavalampe',
    'Klobürste', 'Klorolle', 'Kloschüssel', 'Spülbürste', 'Pfandflasche', 'Dönerbude',
    // Essen
    'Leberwurst', 'Blutwurst', 'Teewurst', 'Presswurst', 'Currywurst', 'Bockwurst', 'Sülze', 'Frikadelle', 'Schweinshaxe', 'Bratensoße',
    'Mayonnaise', 'Dosensuppe',
    // Getier und Grusel
    'Nacktschnecke', 'Blindschleiche', 'Seegurke', 'Kakerlake', 'Zecke', 'Mumie', 'Hexe', 'Moorleiche',
  ],
  n: [
    // Körper
    'Achselhaar', 'Nasenhaar', 'Brusthaar', 'Rückenhaar', 'Ohrenschmalz', 'Ohrläppchen', 'Doppelkinn', 'Muttermal', 'Hühnerauge', 'Gebiss',
    'Toupet', 'Hörgerät', 'Kassengestell', 'Hirn',
    // Spießig und amtlich
    'Finanzamt', 'Ordnungsamt', 'Bürgeramt', 'Formular', 'Aktenzeichen', 'Faxgerät', 'Diktiergerät', 'Schnurtelefon', 'Reihenhaus', 'Vereinsheim',
    'Schützenfest', 'Kaffeekränzchen', 'Gewerbegebiet', 'Sparschwein', 'Furzkissen', 'Fußbad', 'Dixiklo', 'Plumpsklo', 'Klopapier',
    // Essen
    'Mettbrötchen', 'Wurstbrot', 'Fischstäbchen', 'Hackfleisch', 'Eisbein', 'Labskaus', 'Schweineohr', 'Grillhähnchen', 'Spanferkel',
    // Getier und Grusel
    'Sumpfmonster', 'Gespenst', 'Alien', 'Schnabeltier', 'Stinktier', 'Ferkel',
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
