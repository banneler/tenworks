// File: extract-contact-info (in Supabase Dashboard)
// Define CORS headers to allow your app to call this function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
export default async function handler(req) {
  // This handles the browser's security check (preflight request)
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Parse the request body to get the base64 image data
    const { image: base64Image } = await req.json();
    if (!base64Image) {
      throw new Error("Missing image data in request body.");
    }
    // Retrieve the Gemini API key from environment variables (secrets)
    const gemini_api_key = env("GEMINI_API_KEY");
    if (!gemini_api_key) {
      throw new Error("GEMINI_API_KEY secret is not set in Supabase environment variables.");
    }
    // Define the prompt for Gemini to extract contact information
    const prompt = `
            Please extract the following contact information from the provided email signature image or business card.
            The output MUST be a raw JSON object with the following keys:
            "first_name": (string, required if found)
            "last_name": (string, required if found)
            "email": (string, required if found, valid email format)
            "phone": (string, optional, include all phone numbers found, comma-separated if multiple)
            "title": (string, optional)
            "company": (string, optional)

            If a piece of information is not explicitly present, return an empty string for that key.
            Prioritize accuracy. Do not make up information.
            Example output:
            {
                "first_name": "John",
                "last_name": "Doe",
                "email": "john.doe@example.com",
                "phone": "123-456-7890",
                "title": "Software Engineer",
                "company": "Example Corp"
            }
        `;
    // Gemini API endpoint for image understanding
    const API_URL = geminiUrl(gemini_api_key);
    // Prepare the payload for the Gemini API call
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            },
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Image
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            "first_name": {
              "type": "STRING"
            },
            "last_name": {
              "type": "STRING"
            },
            "email": {
              "type": "STRING"
            },
            "phone": {
              "type": "STRING"
            },
            "title": {
              "type": "STRING"
            },
            "company": {
              "type": "STRING"
            } // Still requesting 'company' from Gemini
          },
          required: [
            "first_name",
            "last_name",
            "email"
          ] // Mark required fields
        }
      }
    };
    // Make the API call to Gemini
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    // Handle API response errors
    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      console.error(`Google API Error: ${apiResponse.status} ${apiResponse.statusText} - ${errorBody}`);
      throw new Error(`Failed to get response from Gemini API: ${apiResponse.statusText}`);
    }
    const responseJson = await apiResponse.json();
    // Extract the text part from Gemini's response
    let extractedText = "";
    if (responseJson.candidates && responseJson.candidates.length > 0 && responseJson.candidates[0].content && responseJson.candidates[0].content.parts && responseJson.candidates[0].content.parts.length > 0) {
      extractedText = responseJson.candidates[0].content.parts[0].text;
    } else {
      // If no candidates or content, it might be a safety filter block
      if (responseJson.promptFeedback && responseJson.promptFeedback.blockReason) {
        throw new Error(`Gemini API blocked response: ${responseJson.promptFeedback.blockReason}`);
      }
      throw new Error("Gemini API response did not contain expected content or was empty.");
    }
    // Safely extract JSON from potential markdown (re-introducing this for robustness)
    const jsonMatch = extractedText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      extractedText = jsonMatch[1]; // Use the content inside the code block
    } else {
      extractedText = extractedText.trim();
    }
    // Parse the JSON string received from Gemini
    const parsedContactData = JSON.parse(extractedText);
    // Return the extracted contact data as a JSON response
    return new Response(JSON.stringify(parsedContactData), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error("Error in Edge Function:", error.message);
    // Return a 500 error response with the specific error message
    return new Response(JSON.stringify({
      error: `Failed to process image: ${error.message}`
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
}
