// Kleine DOM-Helfer für die Oberfläche.
// Sicherheit: Texte werden ausschließlich als Textknoten eingefügt (kein innerHTML).

export function h(tag, attrs = {}, ...children) {
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

const signaturen = new WeakMap();

/**
 * Zeichnet den Inhalt von `el` nur dann neu, wenn sich `sig` geändert hat.
 * So bleiben Eingaben, Animationen und der Tastaturfokus erhalten, obwohl bei
 * jeder Zustandsänderung alles durchlaufen wird. Elemente mit `data-fk`
 * bekommen nach dem Neuzeichnen ihren Fokus zurück.
 */
export function erneuere(el, sig, bau) {
  const s = typeof sig === 'string' ? sig : JSON.stringify(sig);
  if (signaturen.get(el) === s) return false;
  signaturen.set(el, s);
  const aktiv = document.activeElement;
  const fk = aktiv && el.contains(aktiv) ? aktiv.dataset.fk : null;
  const inhalt = [bau()].flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false);
  el.replaceChildren(...inhalt);
  if (fk) el.querySelector(`[data-fk="${CSS.escape(fk)}"]`)?.focus({ preventScroll: true });
  return true;
}

export const warte = (ms) => new Promise((r) => setTimeout(r, ms));
