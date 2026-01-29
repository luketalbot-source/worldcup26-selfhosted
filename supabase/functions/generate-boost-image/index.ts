import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { boostId, title, description } = await req.json();

    if (!boostId || !title) {
      throw new Error("boostId and title are required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Generate a prompt for the image based on title and description
    const imagePrompt = `A stylized, professional sports award illustration for: "${title}". ${description ? `Context: ${description}` : ''} Style: Modern, vibrant FIFA World Cup 2026 themed trophy or award card illustration. Clean vector-like design with golden and blue accents. Ultra high resolution. Aspect ratio 16:9.`;

    console.log("Generating image with prompt:", imagePrompt);

    // Call Lovable AI Gateway for image generation
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: imagePrompt
          }
        ],
        modalities: ["image", "text"]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const imageBase64 = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageBase64) {
      console.error("No image in response:", JSON.stringify(data));
      throw new Error("No image generated");
    }

    // Also detect the language of the title/description
    let detectedLanguage = 'en';
    try {
      const langResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              content: `Detect the language of this text and respond with ONLY the 2-letter ISO 639-1 language code (e.g., "en" for English, "es" for Spanish, "de" for German, "fr" for French, "pt" for Portuguese, "it" for Italian). Text: "${title}${description ? ' - ' + description : ''}"`
            }
          ]
        })
      });
      
      if (langResponse.ok) {
        const langData = await langResponse.json();
        const langCode = langData.choices?.[0]?.message?.content?.trim().toLowerCase();
        if (langCode && langCode.length === 2) {
          detectedLanguage = langCode;
        }
      }
    } catch (langErr) {
      console.error("Language detection failed:", langErr);
    }

    // Update the boost record with the image URL and detected language
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: updateError } = await supabase
      .from("tenant_custom_boosts")
      .update({ 
        image_url: imageBase64,
        original_language: detectedLanguage 
      })
      .eq("id", boostId);

    if (updateError) {
      console.error("Error updating boost:", updateError);
      throw updateError;
    }

    console.log("Image generated and saved for boost:", boostId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageUrl: imageBase64,
        detectedLanguage 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
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
