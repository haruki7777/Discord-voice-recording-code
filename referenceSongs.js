export const referenceSongs = {
  scale_practice: {
    id: 'scale_practice',
    title: '연습용 도레미 스케일',
    bpm: 90,
    offsetSeconds: 0,
    notes: [
      { start: 0.0, duration: 0.8, midi: 60, lyric: '도' },
      { start: 0.8, duration: 0.8, midi: 62, lyric: '레' },
      { start: 1.6, duration: 0.8, midi: 64, lyric: '미' },
      { start: 2.4, duration: 0.8, midi: 65, lyric: '파' },
      { start: 3.2, duration: 0.8, midi: 67, lyric: '솔' },
      { start: 4.0, duration: 0.8, midi: 69, lyric: '라' },
      { start: 4.8, duration: 0.8, midi: 71, lyric: '시' },
      { start: 5.6, duration: 1.2, midi: 72, lyric: '도' },
    ],
  },
};

export function getReferenceSong(songId = process.env.DEFAULT_SONG_ID || 'scale_practice') {
  return referenceSongs[songId] || referenceSongs.scale_practice;
}

export function listReferenceSongs() {
  return Object.values(referenceSongs);
}
