import { createClient } from '@supabase/supabase-js';
import { env, geminiUrl } from '../env.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. SIMPLIFIED INPUT: Only the user's topic/prompt is needed now
    const { userPrompt } = await req.json();
    if (!userPrompt) throw new Error("Missing required parameter: userPrompt is required.");

    const gemini_api_key = env("GEMINI_API_KEY");
    
    // Initialize Clients
    const supabaseAdmin = createClient(
      env('SUPABASE_URL') ?? '',
      env('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const supabaseUser = createClient(
      env('SUPABASE_URL') ?? '',
      env('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') } } }
    );

    // 2. IDENTIFY USER & FETCH CONFIG
    // We check for a user-specific persona first, then fall back to the global Ten Works default.
    const { data: { user } } = await supabaseUser.auth.getUser();

    const { data: config } = await supabaseAdmin
      .from('ai_configs')
      .select('persona, voice, custom_instructions')
      .eq('function_id', 'custom-user-social-post')
      .or(`user_id.eq.${user?.id},user_id.is.null`)
      .order('user_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    // 3. TEN WORKS BRAND FALLBACKS
    const persona = config?.persona || "Ten Works Brand Ambassador and Industry Thought Leader.";
    const voice = config?.voice || "Creative, visual, and fun ('Install day is a good day').";
    const instructions = config?.custom_instructions || "Highlight craftsmanship, materials (steel, oak, concrete), and the journey from 'Sketch' to 'Reality'.";

    // 4. CONSTRUCT THE PROMPT
    const prompt = `
      ${persona}
      
      **Tone and Voice:**
      ${voice}

      **Strategic Directive:**
      ${instructions}

      **The Task:**
      Create a LinkedIn post based on the following topic: "${userPrompt}"

      **Content Guidelines:**
      - Focus on the visual and tactile nature of fabrication (welding, sanding, installing).
      - Frame "Wild Ideas" as challenges we love to solve.
      - Keep it professional but energetic.

      **Technical Formatting Requirements:**
      1. 'post_body': Professional LinkedIn format with whitespace between paragraphs.
      2. 'hashtags': A string of 3-4 niche hashtags starting with # (e.g. #TenWorks #Fabrication #WildIdeas).
      3. Return ONLY a raw JSON object with keys: "post_body" and "hashtags".
    `;

    // 5. EXECUTE GEMINI REQUEST
    const API_URL = geminiUrl(gemini_api_key);
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        responseMimeType: "application/json"
      }
    };

    const apiResponse = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const responseJson = await apiResponse.json();
    const finalData = JSON.parse(responseJson.candidates[0].content.parts[0].text);

    return new Response(JSON.stringify(finalData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (err) {
    console.error("Custom Social Post Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
