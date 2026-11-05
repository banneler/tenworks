import { createClient } from '@supabase/supabase-js';
import { env, geminiUrl } from '../env.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { originalText, customPrompt } = await req.json();
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
      .eq('function_id', 'refine-social-post')
      .or(`user_id.eq.${user?.id},user_id.is.null`)
      .order('user_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    // 2. Ten Works Specific Refinement Prompt
    const prompt = `
      ${config?.persona || "You are the Ten Works Professional Social Media Editor."}
      Voice: ${config?.voice || "Polished, punchy, and community-focused."}
      Directive: ${config?.custom_instructions || "Improve the 'Hook' and ensure the craftsmanship shines through."}
      
      **Original Draft:** "${originalText}"
      **Chad's Edit Request:** "${customPrompt}"

      **The Goal:**
      Apply the requested edits while maintaining the Ten Works "Wild Ideas" spirit. Ensure the post remains optimized for mobile scrolling on LinkedIn with plenty of whitespace. 

      **Style Guide:**
      - Focus on the story: Sketch to Install.
      - Use active, tenacious language.
      - Keep it fun and engaging.

      Return ONLY a raw JSON object with the key "suggestion".
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
    console.error("Social Refinement Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 500 });
  }
}
