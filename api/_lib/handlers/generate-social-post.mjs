import { createClient } from '@supabase/supabase-js';
import { env, geminiUrl } from '../env.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json();
    const { article, originalText, customPrompt } = payload;
    const gemini_api_key = env("GEMINI_API_KEY");
    
    // 1. Determine Identity based on Action
    // If we have 'originalText', we are refining. Otherwise, we are generating from an article.
    const fid = originalText ? 'refine-social-post' : 'generate-social-post';

    const supabaseAdmin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const supabaseUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') } }
    });

    const { data: { user } } = await supabaseUser.auth.getUser();

    // 2. Fetch Configuration with Ten Works Fallback
    const { data: config } = await supabaseAdmin
      .from('ai_configs')
      .select('persona, voice, custom_instructions')
      .eq('function_id', fid)
      .or(`user_id.eq.${user?.id},user_id.is.null`)
      .order('user_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    // 3. Ten Works Brand Definitions
    const defaultPersona = "Ten Works Social Media Editor.";
    const defaultVoice = "Polished, community-focused, and visual. 'We give shape to Wild Ideas.'";
    const defaultDirective = "Focus on the craftsmanship and the story behind the news. Use clean formatting optimized for mobile.";

    const persona = config?.persona || defaultPersona;
    const voice = config?.voice || defaultVoice;
    const directive = config?.custom_instructions || defaultDirective;

    // 4. Construct the Prompt
    let taskDescription = "";
    if (originalText) {
      taskDescription = `Refine this existing draft to better match our voice.\nDraft: "${originalText}"\nUser Feedback/Goal: "${customPrompt}"`;
    } else if (article) {
      taskDescription = `Write a LinkedIn post summarizing this industry news for our network.\nArticle Title: "${article.title}"\nSummary: "${article.summary}"\nSource: ${article.source_name}`;
    } else {
      throw new Error("Invalid payload: Missing 'article' or 'originalText'.");
    }

    const prompt = `
      ${persona}
      Voice: ${voice}
      Directive: ${directive}

      **The Task:**
      ${taskDescription}

      **Requirements:**
      - Use short paragraphs and whitespace (LinkedIn style).
      - If generating from an article, focus on why this matters to the fabrication/design world.
      - Return ONLY a raw JSON object.
      - **CRITICAL:** Populate the main text into a key named "suggestion".
      - Include 3-4 relevant hashtags in a key named "hashtags".
    `;

    // 5. API Call with Strict Schema
    const API_URL = geminiUrl(gemini_api_key);
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              "suggestion": { "type": "STRING" },
              "hashtags": { "type": "STRING" }
            },
            required: ["suggestion", "hashtags"]
          }
        }
      })
    });

    const responseJson = await apiResponse.json();
    const rawText = responseJson.candidates[0].content.parts[0].text;
    const cleanJson = rawText.replace(/```json|```/g, "").trim();

    return new Response(cleanJson, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error("Social Hub Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      headers: corsHeaders, 
      status: 500 
    });
  }
}
