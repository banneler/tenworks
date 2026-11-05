import { createClient } from '@supabase/supabase-js';
import { env, geminiUrl } from '../env.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { internalData } = await req.json();
    const gemini_api_key = env("GEMINI_API_KEY");
    
    const supabaseAdmin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const supabaseUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') } }
    });

    const { data: { user } } = await supabaseUser.auth.getUser();

    // 1. Fetch Personalized Ten Works Config with Global Fallback
    const { data: config } = await supabaseAdmin
      .from('ai_configs')
      .select('persona, voice, custom_instructions')
      .eq('function_id', 'get-account-briefing')
      .or(`user_id.eq.${user?.id},user_id.is.null`)
      .order('user_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    // 2. The Strategic Prompt - Rebuilt for Bespoke Fabrication
    const prompt = `
      ${config?.persona || "You are a Market Intelligence Scout for Ten Works Bespoke Fabrication."}
      Voice: ${config?.voice || "Observant, architectural, and design-focused."}
      Additional Instructions: ${config?.custom_instructions || ""}

      ### TEN WORKS STRATEGIC LOGIC:
      1. DESIGN & CONSTRUCTION SIGNALS: Always cross-reference account news with commercial real estate development. Look for mentions of new "Headquarters," "Lobby Renovations," "Public Spaces," or "Bespoke Interiors."
      2. MATERIAL FOCUS: Look for specific needs involving custom steel, feature woodwork, monumental stairs, or complex mixed-media installs.
      3. STRATEGIC PARTNERS: Identify if the account is working with specific architects or GCs (General Contractors) who value high-end craftsmanship over "off-the-shelf" solutions.

      ### CRITICAL DATA INTERPRETATION RULES:
      1. LOG ENTRIES TAGGED AS "AI-Generated Email": These are system labels indicating the tool used to draft the content. Do NOT assume the representative is discussing "Artificial Intelligence" with the client. Determine the actual project topic from the "Subject" (e.g., Shop Drawing status, material lead times, or install scheduling).
      2. WILD IDEAS: Frame the value proposition around "giving shape to wild ideas" and "tenacious problem solving."

      Account Name: ${internalData.accountName}
      CRM Data Context: ${JSON.stringify(internalData)}

      ### Task Requirements:
      - Use search tools for news (last 60 days) regarding new builds, art calls, or expansions.
      - summary: Focus on the actual business relationship, such as current fabrication project status or active "Wild Idea" proposals.
      - activity_highlights: Provide a scannable, bulleted list of recent interactions. Start each line with a bullet (•).
      - key_players: Identify decision makers like Project Managers, Lead Architects, or Facilities Directors. Return a single comma-separated string of names and titles.
      - recommendation: Strategic next steps to move from "Proposal" to "Shop Phase" or "Install."
      - Return ONLY a raw JSON object.
    `;

    // 3. API Call with Hardened Response Schema
    const API_URL = geminiUrl(gemini_api_key);
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ "google_search": {} }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              summary: { type: "STRING" },
              key_players: { type: "STRING" },
              pipeline: { type: "STRING" },
              activity_highlights: { type: "STRING" },
              news: { type: "STRING" },
              new_contacts: { type: "STRING" },
              icebreakers: { type: "STRING" },
              recommendation: { type: "STRING" }
            },
            required: ["summary", "key_players", "pipeline", "activity_highlights", "news", "new_contacts", "icebreakers", "recommendation"]
          }
        }
      })
    });

    const responseJson = await apiResponse.json();
    let text = responseJson.candidates[0].content.parts[0].text;
    
    // 4. Cleanup
    const cleanJson = text.replace(/```json|```/g, "").trim();

    return new Response(cleanJson, { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err) {
    console.error("Account Briefing Function Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      headers: corsHeaders, 
      status: 500 
    });
  }
}
