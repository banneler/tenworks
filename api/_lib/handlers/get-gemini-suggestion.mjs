import { createClient } from '@supabase/supabase-js';
import { env, geminiUrl } from '../env.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { alertData, accountData } = await req.json();
    const gemini_api_key = env("GEMINI_API_KEY");
    
    const supabaseAdmin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const supabaseUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') } }
    });

    const { data: { user } } = await supabaseUser.auth.getUser();

    // 1. Fetch Chad's Personalized Config with Ten Works Fallback
    const { data: config } = await supabaseAdmin
      .from('ai_configs')
      .select('persona, voice, custom_instructions')
      .eq('function_id', 'get-gemini-suggestion')
      .or(`user_id.eq.${user?.id},user_id.is.null`)
      .order('user_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    // 2. Ten Works Specific Strategic Prompt
    const prompt = `
      ${config?.persona || "You are Chad Hershberger, Project Development Manager for Ten Works in Wichita."}
      Voice: ${config?.voice || "Happy, positive, and proactive. Professional but never robotic."}
      Directive: ${config?.custom_instructions || "Translate business news into a collaborative offer to build something cool."}
      
      ### TEN WORKS STRATEGY:
      Signal: ${alertData.headline} - ${alertData.summary}
      Account: ${accountData.name}

      Goal: Use this news signal to offer bespoke fabrication (metal, wood, mixed media). 
      If they are moving, expanding, or winning awards, offer to help 'give shape to the wild ideas' they have for their new or improved space (custom furniture, monumental stairs, architectural elements). 
      Mention that we love 'tenacious problem solving' and 'boundless collaboration.'

      Constraints: 
      - Write in the first person (Chad).
      - Use [FirstName].
      - Do NOT include a signature. 
      - Keep it short, like a punchy LinkedIn DM or personal email.
      - Return ONLY a raw JSON object with keys "subject" and "body".
    `;

    // 3. Execute Gemini Request
    const API_URL = geminiUrl(gemini_api_key);
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const responseJson = await apiResponse.json();
    const cleanJson = responseJson.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
    
    return new Response(cleanJson, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error("Cognito Suggestion Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 500 });
  }
}
