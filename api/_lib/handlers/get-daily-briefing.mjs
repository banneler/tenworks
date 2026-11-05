import { createClient } from '@supabase/supabase-js';
import { env, geminiUrl } from '../env.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. DATA EXTRACTION
    const { briefingPayload } = await req.json();
    
    // UPDATE: We alias 'deals' to 'deals_tw' here to match your new schema mental model
    const { tasks, sequenceSteps, deals: deals_tw, cognitoAlerts, nurtureAccounts, contacts, accounts, sequences, sequence_steps } = briefingPayload;

    if (!tasks || !deals_tw || !cognitoAlerts) {
      throw new Error("Required CRM data fields are missing.");
    }

    const gemini_api_key = env("GEMINI_API_KEY");
    
    // 2. AUTH & CONFIG
    const supabaseAdmin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    const supabaseUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: req.headers.get('Authorization') } }
    });
    const { data: { user } } = await supabaseUser.auth.getUser();

    const { data: config } = await supabaseAdmin
      .from('ai_configs')
      .select('persona, voice, custom_instructions')
      .eq('function_id', 'get-daily-briefing')
      .or(`user_id.eq.${user?.id},user_id.is.null`)
      .order('user_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    // 3. YOUR SECRET SAUCE (Formatting Helpers)
    const findRelatedInfo = (item) => {
      let contact, account, deal;
      if (item.contact_id) {
        contact = contacts.find((c) => c.id === item.contact_id);
        if (contact?.account_id) account = accounts.find((a) => a.id === contact.account_id);
      } else if (item.account_id) {
        account = accounts.find((a) => a.id === item.account_id);
      }
      // UPDATE: Referencing deals_tw
      if (item.deal_id) deal = deals_tw.find((d) => d.id === item.deal_id);
      return { contact, account, deal };
    };

    const formattedTasks = tasks.map((t) => {
      const { contact, account, deal } = findRelatedInfo(t);
      return `- Task: "${t.description}". Due: ${t.due_date}. Linked to: ${contact ? contact.first_name : 'No Contact'}, ${account ? account.name : 'No Account'}.${deal ? ` (Deal: ${deal.name})` : ''}`;
    }).join('\n') || "No pending tasks.";

    // UPDATE: Referencing deals_tw
    const formattedDeals = deals_tw.map((d) => {
      const account = accounts.find((a) => a.id === d.account_id);
      return `- Deal: "${d.name}" (${account?.name || 'Unknown'}) is in "${d.stage}" with MRC $${d.mrc || '0'}.`;
    }).join('\n') || "No open deals.";

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const actionableAlerts = cognitoAlerts.filter((a) => a.status?.toLowerCase() === 'new' && new Date(a.created_at) > sevenDaysAgo);
    
    const formattedAlerts = actionableAlerts.map((a) => {
      const account = accounts.find((ac) => ac.id === a.account_id);
      return `- **New Cognito Alert** for ${account?.name || 'Unknown'}: "${a.headline}". Details: ${a.summary || 'No description.'}`;
    }).join('\n') || "No new Cognito Alerts.";

    // 4. THE PROMPT (Updated for TenWorks Branding)
    const prompt = `
      ${config?.persona || "You are a kick ass business man and tenured sales professional with TenWorks out of Wichita, KS."}
      Voice: ${config?.voice || "Professional, concise, and executive-level."}
      Strategic Directive: ${config?.custom_instructions || "Prioritize revenue-generating activities and high-intent signals."}

      **Framework:**
      1. Priority: Cognito Buying Signals (Immediate Action).
      2. Priority: Late-Stage TenWorks Deals (Proposal/Negotiation) with high MRC.
      3. Momentum: Critical Pending Tasks.

      **Today's Data:**
      - Cognito Alerts: ${formattedAlerts}
      - Open Deals: ${formattedDeals}
      - Pending Tasks: ${formattedTasks}

      Your entire response MUST be a raw JSON object with a single key "priorities", which is an array of objects.
      Each object must have "title" (action) and "reason" (strategic justified why).
    `;

    // 5. THE FETCH
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
              "priorities": {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: { "title": { "type": "STRING" }, "reason": { "type": "STRING" } },
                  required: ["title", "reason"]
                }
              }
            },
            required: ["priorities"]
          }
        }
      })
    });

    const responseJson = await apiResponse.json();
    const cleanJson = responseJson.candidates[0].content.parts[0].text;
    
    return new Response(cleanJson, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error("Function Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
}
