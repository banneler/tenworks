import { createClient } from '@supabase/supabase-js';
import { env, geminiUrl } from '../env.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { activityLog, accountName, contactName } = await req.json();
    const gemini_api_key = env("GEMINI_API_KEY");
    
    const supabaseAdmin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const supabaseUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') } }
    });

    const { data: { user } } = await supabaseUser.auth.getUser();

    // 1. Fetch Ten Works Configuration
    const { data: config } = await supabaseAdmin
      .from('ai_configs')
      .select('persona, voice, custom_instructions')
      .eq('function_id', 'get-activity-insight')
      .or(`user_id.eq.${user?.id},user_id.is.null`)
      .order('user_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    // 2. Ten Works Specific Tactical Prompt
    const prompt = `
      ${config?.persona || "You are a Project Momentum Auditor for Ten Works Fabrication."}
      Voice: ${config?.voice || "Concise, tactical, and timeline-aware."}
      Directive: ${config?.custom_instructions || "Focus on getting projects from 'Wild Idea' to 'Install'."}

      ### Context:
      Project Log for: ${accountName || contactName}
      Chronological Activities: 
      ${activityLog}

      ### Task:
      Analyze the logs for project velocity. 
      1. Identify if a "Wild Idea" proposal is gaining traction or stalling.
      2. Flag mentions of architectural drawings, material selection (steel, wood, etc.), or site visits.
      3. Determine if the relationship is moving toward a Shop Phase or Installation.

      Return a raw JSON object with:
      - "insight": A single punchy paragraph distilling the current momentum and sentiment.
      - "next_steps": A bulleted string of clear, tactical actions (e.g., "Schedule site measure," "Send revised metal finish samples").
    `;

    const API_URL = geminiUrl(gemini_api_key);
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          responseMimeType: "application/json" 
        }
      })
    });

    const responseJson = await apiResponse.json();
    const cleanJson = responseJson.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
    
    return new Response(cleanJson, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error("Activity Insight Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 500 });
  }
}
