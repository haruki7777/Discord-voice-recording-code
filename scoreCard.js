import { createCanvas } from '@napi-rs/canvas';

function gradeText(score) {
  if (score >= 95) return 'LEGEND';
  if (score >= 90) return 'S+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'FUN';
}

function commentText(score) {
  if (score >= 90) return '원곡 싱크가 빛난 무대. 오늘만큼은 인정해줄게.';
  if (score >= 80) return '꽤 잘 불렀어. 음정도 박자도 제법 따라왔네.';
  if (score >= 70) return '가능성 있음. 후렴 피치만 더 잡으면 확 올라가.';
  if (score >= 60) return '기본기는 있어. 박자와 호흡부터 다시 맞춰보자.';
  return '예능감은 합격. 원곡을 더 듣고 다시 도전해봐.';
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawBar(ctx, label, value, x, y, width) {
  ctx.font = '28px sans-serif';
  ctx.fillStyle = '#ffe8c8';
  ctx.fillText(label, x, y);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`${value}`, x + width, y);
  ctx.textAlign = 'left';

  drawRoundRect(ctx, x, y + 14, width, 18, 9);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fill();

  drawRoundRect(ctx, x, y + 14, Math.max(12, (width * value) / 100), 18, 9);
  const gradient = ctx.createLinearGradient(x, 0, x + width, 0);
  gradient.addColorStop(0, '#ff7a18');
  gradient.addColorStop(0.5, '#ffd166');
  gradient.addColorStop(1, '#80ffdb');
  ctx.fillStyle = gradient;
  ctx.fill();
}

export async function createScoreCard({ userTag, songTitle, rank, finalScore, localScore, referenceScore, aiProvider, aiComment }) {
  const width = 1200;
  const height = 675;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#15111f');
  bg.addColorStop(0.45, '#2b1740');
  bg.addColorStop(1, '#4b1f1f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255, ${120 + (i % 90)}, 80, ${0.05 + (i % 5) * 0.018})`;
    ctx.beginPath();
    ctx.arc((i * 83) % width, (i * 47) % height, 2 + (i % 5), 0, Math.PI * 2);
    ctx.fill();
  }

  drawRoundRect(ctx, 45, 40, width - 90, height - 80, 34);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,209,102,0.8)';
  ctx.stroke();

  ctx.fillStyle = '#ffcf6e';
  ctx.font = 'bold 46px sans-serif';
  ctx.fillText('NATSUMI KARAOKE SCORE', 86, 105);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(userTag || 'Unknown Singer', 90, 160);

  ctx.fillStyle = '#ffcdb2';
  ctx.font = '26px sans-serif';
  ctx.fillText(`곡: ${songTitle || 'Unknown Song'}  ·  순위: #${rank}`, 90, 202);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 142px sans-serif';
  ctx.fillText(`${finalScore}`, 930, 215);
  ctx.font = 'bold 48px sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(`${gradeText(finalScore)}`, 930, 274);
  ctx.font = '24px sans-serif';
  ctx.fillStyle = '#ffe8c8';
  ctx.fillText('FINAL SCORE', 930, 310);
  ctx.textAlign = 'left';

  drawBar(ctx, '원곡 싱크', referenceScore?.referenceTotal ?? 0, 90, 285, 570);
  drawBar(ctx, '음정 정확도', referenceScore?.pitchAccuracy ?? 0, 90, 360, 570);
  drawBar(ctx, '리듬', referenceScore?.rhythm ?? 0, 90, 435, 570);
  drawBar(ctx, '성량', localScore?.volumeScore ?? 0, 90, 510, 570);

  drawRoundRect(ctx, 720, 355, 390, 170, 24);
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(`AI 심사: ${aiProvider || 'local'}`, 750, 405);

  ctx.fillStyle = '#ffffff';
  ctx.font = '25px sans-serif';
  const text = aiComment || commentText(finalScore);
  const lines = splitLines(ctx, text, 330);
  lines.slice(0, 3).forEach((line, index) => ctx.fillText(line, 750, 450 + index * 34));

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '22px sans-serif';
  ctx.fillText('최종점수 = 원곡 비교 65% + 기본 음성 35%', 90, 610);
  ctx.fillText(`오차: ${referenceScore?.medianPitchErrorCents ?? 0} cents`, 720, 610);

  return canvas.toBuffer('image/png');
}

function splitLines(ctx, text, maxWidth) {
  const words = String(text).replace(/\n/g, ' ').split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}
