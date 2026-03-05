import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TranslateRequest {
  title: string;
  description: string | null;
  sourceLanguage: string;
  targetLanguage: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { title, description, sourceLanguage, targetLanguage }: TranslateRequest = await req.json();

    // If same language, return as-is
    if (sourceLanguage === targetLanguage) {
      return new Response(
        JSON.stringify({ title, description }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const languageNames: Record<string, string> = {
      en: "English",
      es: "Spanish",
      de: "German",
      fr: "French",
      pt: "Portuguese",
      it: "Italian",
    };

    const targetLangName = languageNames[targetLanguage] || targetLanguage;
    const sourceLangName = languageNames[sourceLanguage] || sourceLanguage;

    const prompt = `Translate the following from ${sourceLangName} to ${targetLangName}. Return ONLY a valid JSON object with "title" and "description" fields. Do not include any other text or explanation.

Title: ${title}
${description ? `Description: ${description}` : 'Description: null'}

Return format:
{"title": "translated title", "description": "translated description or null"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    // Parse the JSON response
    let translated = { title, description };
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        translated = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      // Return original if parsing fails
    }

    return new Response(
      JSON.stringify(translated),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});