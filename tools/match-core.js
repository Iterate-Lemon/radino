// Bewertung von Spotify-Suchtreffern gegen eine Songkarte (rein, testbar).

const NOISE = /\b(live|karaoke|instrumental|cover|tribute|acoustic|akustik|remix|re-?recorded|rerecorded|sped up|slowed|8-?bit|lullaby|made famous|in the style of)\b/;

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s[-–—]\s.*$/, ' ') // "Titel - Remastered 2011", "- Radio Edit"
    .replace(/\b(feat|ft|featuring)\b.*$/, ' ')
    .replace(/&|\+/g, ' and ')
    .replace(/\bund\b/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the\s/, '')
    .trim();
}

function bigrams(s) {
  const t = s.replace(/\s+/g, ' ');
  const out = new Map();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}

/** Dice-Koeffizient auf Zeichenpaaren, 0..1 */
export function similarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const A = bigrams(x);
  const B = bigrams(y);
  let inter = 0;
  let total = 0;
  for (const [g, n] of A) {
    inter += Math.min(n, B.get(g) || 0);
    total += n;
  }
  for (const n of B.values()) total += n;
  return (2 * inter) / total;
}

export function splitArtists(s) {
  return String(s || '')
    .split(/\s*(?:,|&|\/|\bfeat\.?|\bft\.?|\bfeaturing\b|\bx\b|\bund\b|\band\b|\bvs\.?|\bwith\b|\bmit\b)\s*/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function artistScore(cardArtist, trackArtists) {
  const names = trackArtists.map((a) => a.name);
  let best = similarity(cardArtist, names.join(' & '));
  for (const part of splitArtists(cardArtist)) {
    for (const n of names) best = Math.max(best, similarity(part, n));
  }
  return best;
}

/** Punktzahl 0..1 für einen Track-Treffer. */
export function scoreTrack(song, track) {
  const title = Math.max(similarity(song.t, track.name), similarity(song.t.split(' (')[0], track.name));
  const artist = artistScore(song.a, track.artists || []);
  let score = 0.55 * title + 0.45 * artist;
  const cardNoise = NOISE.test(song.t.toLowerCase());
  const trackText = `${track.name} ${track.album?.name || ''}`.toLowerCase();
  if (!cardNoise && NOISE.test(trackText)) score -= 0.3;
  if (track.is_playable === false) score -= 0.4;
  if (track.album?.album_type === 'compilation') score -= 0.03;
  return { score: Math.max(0, Math.min(1, score)), title, artist };
}

export function pickImage(album) {
  const imgs = album?.images || [];
  if (!imgs.length) return null;
  return imgs.reduce((best, i) => (Math.abs((i.width || 300) - 300) < Math.abs((best.width || 300) - 300) ? i : best)).url;
}

export function candidateInfo(track, s) {
  return {
    id: track.id,
    name: track.name,
    artists: (track.artists || []).map((a) => a.name).join(', '),
    album: track.album?.name || '',
    year: (track.album?.release_date || '').slice(0, 4),
    img: pickImage(track.album),
    playable: track.is_playable !== false,
    score: Math.round(s.score * 100) / 100,
  };
}

export function searchQuery(song) {
  const clean = (x) => x.replace(/["“”]/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\s+/g, ' ').trim();
  const artist = splitArtists(song.a)[0] || song.a;
  return `track:${clean(song.t)} artist:${clean(artist)}`;
}
