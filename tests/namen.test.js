import { test, eq, ok, seededRng } from './harness.js';
import { zufallsName, baueName, EIGENSCHAFTEN, HAUPTWOERTER, ENDUNG, NAME_MAX } from '../src/ui/namen.js';
import { LIMITS, cleanName } from '../src/core/game.js';

test('Namensvorschlag: Endung passt zum Geschlecht', () => {
  eq(baueName('tanzend', 'Toaster', 'm'), 'Tanzender Toaster');
  eq(baueName('tanzend', 'Tomate', 'f'), 'Tanzende Tomate');
  eq(baueName('tanzend', 'Telefon', 'n'), 'Tanzendes Telefon');
  eq(baueName('würdevoll', 'Kuh', 'f'), 'Würdevolle Kuh');
});

test('Namensvorschlag: Listen sind sauber', () => {
  eq(NAME_MAX, LIMITS.nameLength);
  eq(Object.keys(ENDUNG), ['m', 'f', 'n']);
  const alle = Object.values(HAUPTWOERTER).flat();
  eq(new Set(alle).size, alle.length, 'kein Hauptwort doppelt');
  eq(new Set(EIGENSCHAFTEN).size, EIGENSCHAFTEN.length, 'keine Eigenschaft doppelt');
  for (const e of EIGENSCHAFTEN) {
    ok(/^[a-zäöüß]+$/.test(e), `Eigenschaft klein und ohne Endung: ${e}`);
    // „müde“ → „müder“, „dunkel“ → „dunkler“, „teuer“ → „teurer“: solche Stämme ändern sich.
    ok(!/(e|el|auer|euer)$/.test(e), `Endung ändert den Stamm nicht: ${e}`);
    // Jede Eigenschaft passt zu Wörtern aller drei Geschlechter.
    for (const [g, woerter] of Object.entries(HAUPTWOERTER)) {
      ok(woerter.some((w) => baueName(e, w, g).length <= NAME_MAX), `${e} findet ein Wort (${g})`);
    }
  }
  for (const w of alle) ok(/^[A-ZÄÖÜ][a-zäöüß]+$/.test(w), `Hauptwort groß, ein Wort: ${w}`);
});

test('Namensvorschlag: zufällig, kurz genug, übersteht cleanName', () => {
  const rng = seededRng(7);
  const gesehen = new Set();
  for (let i = 0; i < 500; i++) {
    const n = zufallsName(rng);
    ok(n.length <= NAME_MAX, `zu lang: ${n}`);
    eq(cleanName(n), n);
    ok(/^[A-ZÄÖÜ][a-zäöüß]+(er|e|es) [A-ZÄÖÜ][a-zäöüß]+$/.test(n), `Form: ${n}`);
    gesehen.add(n);
  }
  ok(gesehen.size > 400, `zu wenig Abwechslung: ${gesehen.size}`);
  const fest = () => 0; // immer das erste Wort
  ok(zufallsName(fest) === zufallsName(fest));
  ok(zufallsName(rng, 'Tanzender Toaster') !== 'Tanzender Toaster');
});
