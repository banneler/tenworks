// Single AI router: POST /api/ai  { action, ...originalBody }  (Bearer = Supabase access token)
import { CORS, json } from './_lib/http.mjs';
import { requireUser } from './_lib/auth.mjs';
import { installGeminiFallback } from './_lib/gemini-fetch.mjs';
import customUserSocialPost from './_lib/handlers/custom-user-social-post.mjs';
import extractContactInfo from './_lib/handlers/extract-contact-info.mjs';
import generateCustomSuggestion from './_lib/handlers/generate-custom-suggestion.mjs';
import generateProspectEmail from './_lib/handlers/generate-prospect-email.mjs';
import generateSequenceSteps from './_lib/handlers/generate-sequence-steps.mjs';
import generateSocialPost from './_lib/handlers/generate-social-post.mjs';
import getAccountBriefing from './_lib/handlers/get-account-briefing.mjs';
import getActivityInsight from './_lib/handlers/get-activity-insight.mjs';
import getDailyBriefing from './_lib/handlers/get-daily-briefing.mjs';
import getGeminiSuggestion from './_lib/handlers/get-gemini-suggestion.mjs';
import globalSearch from './_lib/handlers/global-search.mjs';
import refineSocialPost from './_lib/handlers/refine-social-post.mjs';

export const config = { maxDuration: 60 };

const ACTIONS = {
  'custom-user-social-post': customUserSocialPost,
  'extract-contact-info': extractContactInfo,
  'generate-custom-suggestion': generateCustomSuggestion,
  'generate-prospect-email': generateProspectEmail,
  'generate-sequence-steps': generateSequenceSteps,
  'generate-social-post': generateSocialPost,
  'get-account-briefing': getAccountBriefing,
  'get-activity-insight': getActivityInsight,
  'get-daily-briefing': getDailyBriefing,
  'get-gemini-suggestion': getGeminiSuggestion,
  'global-search': globalSearch,
  'refine-social-post': refineSocialPost,
};

export function OPTIONS() { return new Response('ok', { headers: CORS }); }

export async function POST(req) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const { action, ...rest } = body || {};
  const handler = ACTIONS[action];
  if (!handler) return json({ error: `Unknown action: ${action}` }, 400);
  installGeminiFallback();
  // Re-issue the original body to the ported handler so its contract is unchanged.
  const inner = new Request('http://internal/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify(rest),
  });
  return handler(inner);
}
