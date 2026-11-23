import { test, eq, ok } from './harness.js';
import { normalize, similarity, scoreTrack, splitArtists, searchQuery } from '../tools/match-core.js';

const track = (name, artists, extra = {}) => ({ id: 'x', name, artists: artists.map((n) => ({ name: n })), album: { name: 'A', album_type: 'album' }, ...extra });

test('Abgleich: Normalisierung entfernt Remaster-Zusätze', () => {
  eq(normalize('Under the Bridge - Remastered 2003'), 'under the bridge');
  eq(normalize('Schöner fremder Mann'), 'schoner fremder mann');
  eq(normalize('Rock & Roll (Live)'), 'rock and roll');
  eq(similarity('Heaven - 2011 Remaster', 'Heaven'), 1);
});

test('Abgleich: gleicher Song bekommt hohe Punktzahl', () => {
  const s = scoreTrack({ t: 'Wann wird’s mal wieder richtig Sommer', a: 'Rudi Carrell' }, track("Wann wird's mal wieder richtig Sommer", ['Rudi Carrell']));
  ok(s.score > 0.85, `Punktzahl ${s.score}`);
});

test('Abgleich: Live-/Karaoke-Versionen werden abgewertet', () => {
  const song = { t: 'Love Shack', a: "The B-52's" };
  const a = scoreTrack(song, track('Love Shack', ["The B-52's"]));
  const b = scoreTrack(song, track('Love Shack - Live', ["The B-52's"]));
  const c = scoreTrack(song, track('Love Shack (Karaoke Version)', ['Karaoke Hits']));
  ok(a.score > b.score && b.score > c.score, `${a.score} ${b.score} ${c.score}`);
});

test('Abgleich: mehrere Interpreten', () => {
  eq(splitArtists('Simon & Garfunkel'), ['Simon', 'Garfunkel']);
  eq(splitArtists('Alle Farben feat. Kelvin Jones'), ['Alle Farben', 'Kelvin Jones']);
  const s = scoreTrack({ t: 'Paris', a: 'Alle Farben feat. Kelvin Jones' }, track('Paris', ['Alle Farben', 'Kelvin Jones']));
  ok(s.artist > 0.9);
});

test('Abgleich: nicht abspielbare Treffer werden abgewertet', () => {
  const song = { t: 'Hells Bells', a: 'AC/DC' };
  ok(scoreTrack(song, track('Hells Bells', ['AC/DC'], { is_playable: false })).score < 0.7);
});

test('Abgleich: Suchanfrage ohne Klammern und Anführungszeichen', () => {
  eq(searchQuery({ t: 'Bodyguard (I Will Always Love You)', a: 'Whitney Houston' }), 'track:Bodyguard artist:Whitney Houston');
});
