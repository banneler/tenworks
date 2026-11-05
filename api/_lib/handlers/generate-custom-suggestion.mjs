import { createClient } from '@supabase/supabase-js';
import { env, geminiUrl } from '../env.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { originalSuggestion, userInstruction } = await req.json();
    const gemini_api_key = env("GEMINI_API_KEY");
    
    const supabaseAdmin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const supabaseUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') } }
    });

    const { data: { user } } = await supabaseUser.auth.getUser();

    // 1. Fetch Ten Works Refinement Config
    const { data: config } = await supabaseAdmin
      .from('ai_configs')
      .select('persona, voice, custom_instructions')
      .eq('function_id', 'generate-custom-suggestion')
      .or(`user_id.eq.${user?.id},user_id.is.null`)
      .order('user_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    // 2. The Collaborative Refinement Prompt
    const prompt = `
      ${config?.persona || "You are a Senior Communications Coach for Ten Works Fabrication."}
      Voice: ${config?.voice || "Direct, collaborative, and partner-led."}
      Directive: ${config?.custom_instructions || "Maintain the 'Wild Ideas' spirit while applying specific edits."}
      
      ### Current Outreach Draft: 
      Subject: ${originalSuggestion.subject}
      Body: ${originalSuggestion.body}

      ### Chad's Feedback/Instruction: 
      "${userInstruction}"

      ### The Task:
      Refine the email draft based on Chad's feedback. 
      Ensure the tone remains professional but high-energy. 
      Focus on the outcome of the fabrication (monumental stairs, custom steel, unique wood elements).

      ### CRITICAL CONSTRAINTS:
      - Always preserve the [FirstName] placeholder exactly as it is.
      - Do NOT include a signature block.
      - Return ONLY a raw JSON object with keys: "subject" and "body".
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
    console.error("Custom Suggestion Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 500 });
  }
}
