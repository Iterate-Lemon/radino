// Verbindungs-Optionen aus config.js: die Verbindungsdienste und der Schlüssel des Raums.
import { CONFIG } from '../../config.js';

export function peerOptions(secret) {
  return { relays: CONFIG.relays, secret };
}
