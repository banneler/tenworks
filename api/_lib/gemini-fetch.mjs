import { geminiModels } from './env.mjs';
// Wrap global fetch once: Gemini generateContent calls retry on the fallback model.
let installed = false;
export function installGeminiFallback() {
  if (installed) return; installed = true;
  const orig = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const u = typeof input === 'string' ? input : input?.url;
    const res = await orig(input, init);
    const models = geminiModels();
    if (models.length > 1 && u && u.includes(`/models/${models[0]}:generateContent`) &&
        (res.status === 404 || res.status === 429 || res.status >= 500)) {
      return orig(u.replace(`/models/${models[0]}:`, `/models/${models[1]}:`), init);
    }
    return res;
  };
}
