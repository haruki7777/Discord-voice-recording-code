function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const avg = average(values);
  return Math.sqrt(average(values.map((value) => (value - avg) ** 2)));
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function frequencyToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

function centsDiff(actualFreq, targetMidi) {
  if (!actualFreq || actualFreq <= 0) return null;
  const targetFreq = midiToFrequency(targetMidi);
  return 1200 * Math.log2(actualFreq / targetFreq);
}

function estimateFrequencyFromPcm(pcmChunk, sampleRate = 48000, channels = 2) {
  if (!pcmChunk || pcmChunk.length < 2048) return null;

  const mono = [];
  for (let offset = 0; offset + channels * 2 - 1 < pcmChunk.length; offset += channels * 2) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      sum += pcmChunk.readInt16LE(offset + channel * 2) / 32768;
    }
    mono.push(sum / channels);
  }

  if (mono.length < 512) return null;

  const rms = Math.sqrt(average(mono.map((sample) => sample * sample)));
  if (rms < 0.01) return null;

  const minFreq = 80;
  const maxFreq = 1000;
  const minLag = Math.floor(sampleRate / maxFreq);
  const maxLag = Math.min(Math.floor(sampleRate / minFreq), mono.length - 2);
  let bestLag = 0;
  let bestCorrelation = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    for (let i = 0; i + lag < mono.length; i++) {
      correlation += mono[i] * mono[i + lag];
    }
    correlation /= mono.length - lag;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (!bestLag || bestCorrelation < 0.001) return null;
  const freq = sampleRate / bestLag;
  if (freq < minFreq || freq > maxFreq) return null;
  return freq;
}

function findReferenceNote(referenceSong, elapsedSeconds) {
  if (!referenceSong?.notes?.length) return null;
  const time = elapsedSeconds - (referenceSong.offsetSeconds || 0);
  return referenceSong.notes.find((note) => time >= note.start && time <= note.start + note.duration) || null;
}

export function createEmptyReferenceStats() {
  return {
    pitchSamples: [],
    matchedNotes: 0,
    totalPitchFrames: 0,
    rhythmHits: 0,
    rhythmMisses: 0,
    firstFrameAt: null,
    lastFrameAt: null,
  };
}

export function updateReferenceStats(stats, pcmChunk, referenceSong, elapsedSeconds) {
  const freq = estimateFrequencyFromPcm(pcmChunk);
  if (!freq) return;

  const note = findReferenceNote(referenceSong, elapsedSeconds);
  stats.totalPitchFrames++;
  stats.firstFrameAt ??= elapsedSeconds;
  stats.lastFrameAt = elapsedSeconds;

  if (!note) {
    stats.rhythmMisses++;
    return;
  }

  const cents = centsDiff(freq, note.midi);
  if (cents === null) return;

  const absCents = Math.abs(cents);
  stats.pitchSamples.push({
    time: elapsedSeconds,
    frequency: freq,
    midi: frequencyToMidi(freq),
    targetMidi: note.midi,
    cents,
    absCents,
  });
  stats.matchedNotes++;

  const position = elapsedSeconds - (referenceSong.offsetSeconds || 0) - note.start;
  const center = note.duration / 2;
  const timingError = Math.abs(position - center) / Math.max(note.duration, 0.001);
  if (timingError <= 0.55) stats.rhythmHits++;
  else stats.rhythmMisses++;
}

export function scoreAgainstReference(referenceStats, referenceSong) {
  const errors = referenceStats.pitchSamples.map((sample) => sample.absCents);
  const avgError = average(errors);
  const medError = median(errors);
  const pitchStabilityCents = standardDeviation(errors);

  const pitchAccuracy = clamp(100 - medError / 2, 0, 100);
  const pitchStability = clamp(100 - pitchStabilityCents / 2.5, 0, 100);
  const coverage = clamp((referenceStats.matchedNotes / Math.max(referenceStats.totalPitchFrames, 1)) * 100, 0, 100);
  const rhythm = clamp((referenceStats.rhythmHits / Math.max(referenceStats.rhythmHits + referenceStats.rhythmMisses, 1)) * 100, 0, 100);
  const melodyCoverage = clamp((referenceStats.matchedNotes / Math.max((referenceSong?.notes?.length || 1) * 4, 1)) * 100, 0, 100);

  const referenceTotal = Math.round(
    pitchAccuracy * 0.38 +
      pitchStability * 0.22 +
      rhythm * 0.2 +
      coverage * 0.1 +
      melodyCoverage * 0.1,
  );

  return {
    referenceTotal: clamp(referenceTotal, 0, 100),
    pitchAccuracy: Math.round(pitchAccuracy),
    pitchStability: Math.round(pitchStability),
    rhythm: Math.round(rhythm),
    coverage: Math.round(coverage),
    melodyCoverage: Math.round(melodyCoverage),
    averagePitchErrorCents: Math.round(avgError || 0),
    medianPitchErrorCents: Math.round(medError || 0),
  };
}

export function combineScores(localScore, referenceScore) {
  if (!referenceScore) return localScore.total;
  return Math.round(localScore.total * 0.35 + referenceScore.referenceTotal * 0.65);
}
