// Shared env + Gemini helpers for TenWorks Vercel functions.
// gemini-flash-latest / 2.x models are retired; default to a current model with fallback.
export const GEMINI_STOCK_MODEL = 'gemini-3.7-flash';
const RETIRED = new Set(['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest']);

export function env(name) {
  return process.env[name];
}

function pick(name) {
  const v = (process.env[name] || '').trim();
  return v && !RETIRED.has(v) ? v : null;
}

export function geminiModels() {
  const primary = pick('GEMINI_MODEL') || GEMINI_STOCK_MODEL;
  const fallback = pick('GEMINI_FALLBACK_MODEL');
  return fallback && fallback !== primary ? [primary, fallback] : [primary];
}

// Ported handlers build a URL and call fetch(); we return the primary-model URL and
// the router installs a fetch wrapper that retries on the fallback model on 404/429/5xx.
export function geminiUrl(key) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${geminiModels()[0]}:generateContent?key=${key}`;
}
