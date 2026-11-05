import { json } from './http.mjs';

export function fail(error, logLabel) {
  if (logLabel) console.error(logLabel, error?.message || error);
  const status = Number(error?.status) || 500;
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return json({ error: message }, status >= 400 && status < 600 ? status : 500);
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}
