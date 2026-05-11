const DIFFICULTIES = {
  easy: {
    id: 'easy',
    label: 'EASY',
    emoji: '🟢',
    description: '가볍게 즐기는 모드입니다. 성량과 안정감 기준이 널널합니다.',
    strictness: 0.82,
    bonus: 8,
  },
  normal: {
    id: 'normal',
    label: 'NORMAL',
    emoji: '🟡',
    description: '일반 노래방 느낌입니다. 균형 잡힌 기준으로 채점합니다.',
    strictness: 1.0,
    bonus: 0,
  },
  hard: {
    id: 'hard',
    label: 'HARD',
    emoji: '🔴',
    description: '빡센 심사 모드입니다. 흔들림과 약한 성량을 크게 감점합니다.',
    strictness: 1.22,
    bonus: -8,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const avg = average(values);
  return Math.sqrt(average(values.map((value) => (value - avg) ** 2)));
}

export function getDifficulty(id = 'normal') {
  return DIFFICULTIES[id] || DIFFICULTIES.normal;
}

export function listDifficulties() {
  return Object.values(DIFFICULTIES);
}

export function scorePerformance(stats, difficultyId = 'normal') {
  const difficulty = getDifficulty(difficultyId);
  const durationSeconds = stats.totalSamples / 48000 / 2;
  const loudnessAvg = average(stats.loudness);
  const loudnessDev = standardDeviation(stats.loudness);
  const zcrAvg = average(stats.zeroCrossings);
  const zcrDev = standardDeviation(stats.zeroCrossings);

  const volumeRaw = clamp(loudnessAvg * 360, 0, 100);
  const powerRaw = clamp(stats.peak * 135, 0, 100);
  const volumeConsistencyRaw = clamp(100 - (loudnessDev / Math.max(loudnessAvg, 0.001)) * 115, 0, 100);
  const toneStabilityRaw = clamp(100 - (zcrDev / Math.max(zcrAvg, 0.001)) * 150, 0, 100);
  const sustainRaw = clamp(durationSeconds * 8.5, 0, 100);
  const activityRaw = clamp((stats.chunks / Math.max(durationSeconds, 1)) * 18, 0, 100);

  const rawTotal = Math.round(
    toneStabilityRaw * 0.28 +
      volumeConsistencyRaw * 0.23 +
      volumeRaw * 0.18 +
      powerRaw * 0.12 +
      sustainRaw * 0.12 +
      activityRaw * 0.07,
  );

  const strictTotal = Math.round((rawTotal - 50) / difficulty.strictness + 50 + difficulty.bonus);
  const finalScore = clamp(strictTotal, 0, 100);

  return {
    total: finalScore,
    rawTotal: clamp(rawTotal, 0, 100),
    durationSeconds,
    toneStability: Math.round(clamp((toneStabilityRaw - 50) / difficulty.strictness + 50, 0, 100)),
    volumeConsistency: Math.round(clamp((volumeConsistencyRaw - 50) / difficulty.strictness + 50, 0, 100)),
    volumeScore: Math.round(clamp((volumeRaw - 50) / difficulty.strictness + 50, 0, 100)),
    powerScore: Math.round(clamp((powerRaw - 50) / difficulty.strictness + 50, 0, 100)),
    sustainScore: Math.round(clamp((sustainRaw - 50) / difficulty.strictness + 50, 0, 100)),
    activityScore: Math.round(clamp((activityRaw - 50) / difficulty.strictness + 50, 0, 100)),
    difficulty,
  };
}

export function localJudgeComment(score) {
  if (score.total >= 95) return '무대 찢었다. 오늘은 진짜 레전드 인정해줄게.';
  if (score.total >= 88) return '오, 꽤 안정적이야. 성량도 살아있고 분위기도 좋아.';
  if (score.total >= 78) return '괜찮아. 중간 흔들림만 잡으면 더 올라가.';
  if (score.total >= 65) return '가능성은 있어. 호흡이랑 성량 유지부터 다시 잡자.';
  return '오늘은 예능 무대야. 그래도 도망 안 친 건 칭찬해줄게.';
}
