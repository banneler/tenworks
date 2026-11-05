import { createClient } from '@supabase/supabase-js';
import { env, geminiUrl } from '../env.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function generateDynamicExample(stepTypes) {
  const exampleSteps = stepTypes.map((type, index) => ({
    type: type,
    delay_days: index * 2 + 1,
    subject: type === 'Email' ? 'Example Subject' : '',
    message: `Sample message for ${type}.`
  }));
  return JSON.stringify({ steps: exampleSteps });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();

    // FLEXIBLE MAPPING
    const goal = body.sequenceGoal || body.goal;
    const steps = body.numSteps || body.steps;
    const duration = body.totalDuration || body.duration;
    const types = body.stepTypes || body.types;
    const persona = body.personaPrompt || body.persona;

    if (!goal || !steps || !duration || !types || types.length === 0 || !persona) {
       throw new Error("Missing essential sequence parameters.");
    }

    const gemini_api_key = env("GEMINI_API_KEY");
    const dynamicExample = generateDynamicExample(types);

    const prompt = `
      You are Chad Hershberger, Project Development Manager for Ten Works. We give shape to "Wild Ideas" via bespoke fabrication.
      Generate an outreach sequence of ${steps} steps over ${duration} days.
      Topic: "${goal}"
      Persona/Voice: "${persona}"

      **CRITICAL:** - Step Types MUST BE: ${types.join(', ')}.
      - For 'Email', provide 'subject' and 'message'.
      - For others, 'subject' MUST be empty.
      - Use placeholders: [FirstName], [LastName], [AccountName].
      - Do NOT include signatures.

      Return ONLY a raw JSON object with a single key "steps".
      Example: ${dynamicExample}
    `;

    const API_URL = geminiUrl(gemini_api_key);
    
    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            "steps": {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  "type": { "type": "STRING" },
                  "delay_days": { "type": "INTEGER" },
                  "subject": { "type": "STRING" },
                  "message": { "type": "STRING" }
                },
                required: ["type", "delay_days", "message"]
              }
            }
          },
          required: ["steps"]
        }
      }
    };

    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
        const errorDetail = await apiResponse.text();
        throw new Error(`Gemini API returned ${apiResponse.status}: ${errorDetail}`);
    }

    const responseJson = await apiResponse.json();
    
    // Defensive check for response structure
    if (!responseJson.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.error("Incomplete Gemini Response:", JSON.stringify(responseJson));
        throw new Error("Gemini failed to generate valid content. Check safety settings or quota.");
    }

    const content = responseJson.candidates[0].content.parts[0].text;

    return new Response(content, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error("EDGE FUNCTION CRASH:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
