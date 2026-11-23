// Ausführen: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/run-jsc.js
import { run } from './harness.js';
import './game.test.js';
import './protocol.test.js';
import './match.test.js';
import './tokens.test.js';

run((line) => print(line)).then((failed) => {
  if (failed) throw new Error(failed + ' Test(s) fehlgeschlagen');
});
