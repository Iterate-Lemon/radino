// PeerJS-Optionen aus config.js (Vermittlungsdienst und optionale STUN/TURN-Server).
import { CONFIG } from '../../config.js';

export function peerOptions() {
  const o = { ...CONFIG.peer };
  if (Array.isArray(CONFIG.iceServers) && CONFIG.iceServers.length) {
    // Eigene Server zusätzlich zu einem öffentlichen STUN-Server
    o.config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, ...CONFIG.iceServers] };
  }
  return o;
}
