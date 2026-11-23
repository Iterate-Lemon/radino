// Mini-Testrahmen, läuft im Browser (tests/index.html) und mit macOS-jsc:
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/run-jsc.js
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} erwartet ${b}, erhalten ${a}`);
}

export function ok(value, msg = 'Bedingung nicht erfüllt') {
  if (!value) throw new Error(msg);
}

export async function run(log = (line) => console.log(line)) {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      log(`ok   ${t.name}`);
    } catch (e) {
      failed++;
      log(`FAIL ${t.name}: ${e && e.message}`);
    }
  }
  log(`${tests.length - failed}/${tests.length} Tests bestanden`);
  return failed;
}

/** Deterministischer Zufall für Tests. */
export function seededRng(seed = 42) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
