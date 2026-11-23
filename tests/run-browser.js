import { run } from './harness.js';
import './game.test.js';
import './protocol.test.js';
import './match.test.js';
import './tokens.test.js';

const out = document.getElementById('out');
const lines = [];
run((line) => {
  lines.push(line);
  out.textContent = lines.join('\n');
});
