import { createClient } from '@supabase/supabase-js';
import { env, geminiUrl } from '../env.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. SIMPLIFIED INPUT: No products or industry
    const { contactName, accountName, userPrompt } = await req.json();
    const gemini_api_key = env("GEMINI_API_KEY");
    
    const supabaseAdmin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const supabaseUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') } }
    });

    const { data: { user } } = await supabaseUser.auth.getUser();

    // 2. Fetch Identity & Personalized Voice
    const { data: userData } = await supabaseUser.from('user_quotas').select('full_name, title').eq('user_id', user?.id).single();
    
    const { data: config } = await supabaseAdmin
      .from('ai_configs')
      .select('persona, voice, custom_instructions')
      .eq('function_id', 'generate-prospect-email')
      .or(`user_id.eq.${user?.id},user_id.is.null`)
      .order('user_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    // 3. THE PROMPT (TenWorks Branded Fallbacks)
    // We removed the product context block entirely.
    const prompt = `
      ${config?.persona || `You are ${userData?.full_name || 'a Project Development Manager'}, ${userData?.title || 'at TenWorks Fabrication'}.`}
      Voice: ${config?.voice || "Industrial, executive, and direct."}
      Directive: ${config?.custom_instructions || "Focus on operational efficiency and ROI. Keep it concise."}

      Goal: ${userPrompt}
      Recipient: ${contactName} at ${accountName}

      Constraints: 
      - Use [FirstName] as a placeholder for the contact's first name.
      - Do NOT include a signature or sign-off.
      - Return a raw JSON object with keys: "subject" and "body".
    `;

    // 4. THE FETCH
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
    console.error("Function Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 500 });
  }
}
