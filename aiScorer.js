const AI_TIMEOUT_MS = 12000;

function enabledProviders() {
  const providers = [];
  if (process.env.OPENAI_API_KEY) providers.push('openai');
  if (process.env.GEMINI_API_KEY) providers.push('gemini');
  if (process.env.ANTHROPIC_API_KEY) providers.push('claude');
  return providers;
}

function withTimeout(promise, ms = AI_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    run: promise(controller.signal).finally(() => clearTimeout(timeout)),
  };
}

function buildPrompt({ userId, score }) {
  return `너는 디스코드 노래방 AI 심사위원 나츠미야.\n` +
    `유저 ID: ${userId}\n` +
    `총점: ${score.total}/100\n` +
    `음정 안정감: ${score.pitchStability}/100\n` +
    `성량: ${score.volumeScore}/100\n` +
    `성량 유지력: ${score.volumeConsistency}/100\n` +
    `파워: ${score.powerScore}/100\n` +
    `노래 길이: ${score.durationSeconds.toFixed(1)}초\n\n` +
    `규칙:\n` +
    `- 한국어로 말해.\n` +
    `- 디스코드에 바로 올릴 짧은 평가를 해.\n` +
    `- 장난스럽지만 너무 무례하지 않게 해.\n` +
    `- 1줄 피드백과 1줄 개선 팁을 줘.\n` +
    `- 점수는 이미 계산되어 있으니 바꾸지 마.\n` +
    `- 250자 이하로 답해.`;
}

async function callOpenAI(prompt) {
  const request = (signal) => fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a concise Korean Discord karaoke judge.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 220,
    }),
  });

  const { run } = withTimeout(request);
  const res = await run;
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim();
}

async function callGemini(prompt) {
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const request = (signal) => fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 220 },
    }),
  });

  const { run } = withTimeout(request);
  const res = await run;
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.map((part) => part.text).join('').trim();
}

async function callClaude(prompt) {
  const request = (signal) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-3-5-haiku-latest',
      max_tokens: 220,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const { run } = withTimeout(request);
  const res = await run;
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}`);
  const json = await res.json();
  return json.content?.map((part) => part.text).join('').trim();
}

export async function judgeWithAI({ userId, score, fallbackComment }) {
  const providers = enabledProviders();
  if (!providers.length) {
    return { provider: 'local', comment: fallbackComment };
  }

  const prompt = buildPrompt({ userId, score });
  const calls = {
    openai: callOpenAI,
    gemini: callGemini,
    claude: callClaude,
  };

  for (const provider of providers) {
    try {
      const comment = await calls[provider](prompt);
      if (comment) return { provider, comment };
    } catch (error) {
      console.warn(`[AI scorer] ${provider} skipped:`, error.message);
    }
  }

  return { provider: 'local', comment: fallbackComment };
}

export function getEnabledAiProviderNames() {
  return enabledProviders();
}
