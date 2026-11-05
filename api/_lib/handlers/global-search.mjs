// supabase/functions/global-search/index.ts

import { createClient } from '@supabase/supabase-js';
import { env, geminiUrl } from '../env.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Add logging at each step to see where it fails
  try {
    console.log("Function invoked. Parsing request body...");
    const { searchTerm } = await req.json();
    console.log(`Search term received: "${searchTerm}"`);

    if (!searchTerm || searchTerm.length < 2) {
      return new Response(JSON.stringify({ error: "Search term is required." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    console.log("Creating authenticated Supabase client...");
    const supabaseClient = createClient(
      env('SUPABASE_URL') ?? '',
      env('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') } } }
    );
    console.log("Client created. Executing database queries...");

    const [accountsRes, contactsRes, dealsRes, projectsRes] = await Promise.all([
      supabaseClient.from('accounts').select('id, name').ilike('name', `%${searchTerm}%`).limit(5),
      supabaseClient.from('contacts').select('id, first_name, last_name').or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`).limit(5),
      supabaseClient.from('deals_tw').select('id, name').ilike('name', `%${searchTerm}%`).limit(5),
      supabaseClient.from('projects').select('id, name').ilike('name', `%${searchTerm}%`).limit(5)
    ]);
    console.log("Queries finished. Checking for errors...");

    // **THIS IS THE CRITICAL FIX**
    // We must check the .error property of each query result.
    if (accountsRes.error) throw accountsRes.error;
    if (contactsRes.error) throw contactsRes.error;
    if (dealsRes.error) throw dealsRes.error;
    if (projectsRes.error) throw projectsRes.error;
    
    console.log("No query errors found. Processing results...");

    const results = [];
    if (accountsRes.data) {
      accountsRes.data.forEach(a => results.push({ type: 'Account', name: a.name, url: `accounts.html?accountId=${a.id}` }));
    }
    if (contactsRes.data) {
      contactsRes.data.forEach(c => results.push({ type: 'Contact', name: `${c.first_name} ${c.last_name}`, url: `contacts.html?contactId=${c.id}` }));
    }
    if (dealsRes.data) {
      dealsRes.data.forEach(d => results.push({ type: 'Deal', name: d.name, url: `deals.html?dealId=${d.id}` }));
    }
    if (projectsRes.data) {
      projectsRes.data.forEach(p => results.push({ type: 'Project', name: p.name, url: `projects.html?projectId=${p.id}` }));
    }
    console.log("Returning successful response.");

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    // This will now catch the database errors and log them properly.
    console.error("Error caught in function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}
