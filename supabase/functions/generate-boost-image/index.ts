import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    // The content should drive the imagery, with consistent styling
    const contentFocus = description 
      ? `The image MUST visually represent: "${title}" - ${description}`
      : `The image MUST visually represent: "${title}"`;

    const imagePrompt = `${contentFocus}

CONTENT IS KEY: The image should clearly illustrate the specific concept described above. For example:
- If about "Most Goals" → show a net full of balls, a striker celebrating, or a scoreboard
- If about "Best Defense" → show a goalkeeper making a save, or defenders blocking
- If about "Fair Play" → show sportsmanship, handshakes, or clean tackles
- If about a specific team → incorporate their colors or iconic imagery

STYLE REQUIREMENTS (apply to the content above):
- Dramatic, cinematic soccer/football themed illustration
- Rich colors with golden/metallic accents for an award feel
- Deep background with dramatic lighting (spotlights, lens flares, bokeh)
- Professional sports photography/illustration style
- Dark navy blue or black gradient background for contrast
- NO TEXT whatsoever in the image
- 16:9 landscape aspect ratio
- Epic, celebratory World Cup atmosphere

The subject matter from the title/description should be the HERO of the image, not just a generic trophy.

IMPORTANT: Generate and return an actual high-quality image, not a description.`;

    console.log("Generating image with prompt:", imagePrompt);

    // Call Lovable AI Gateway for image generation with retry logic
    let imageBase64: string | null = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (!imageBase64 && attempts < maxAttempts) {
      attempts++;
      console.log(`Image generation attempt ${attempts}/${maxAttempts}`);
      
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
      console.log("AI Gateway response structure:", {
        hasChoices: !!data.choices,
        choicesLength: data.choices?.length,
        hasMessage: !!data.choices?.[0]?.message,
        hasImages: !!data.choices?.[0]?.message?.images,
        imagesLength: data.choices?.[0]?.message?.images?.length,
        textContent: data.choices?.[0]?.message?.content?.substring(0, 100)
      });
      
      imageBase64 = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!imageBase64 && attempts < maxAttempts) {
        console.log("No image in response, retrying...");
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // If still no image after retries, use a placeholder approach
    if (!imageBase64) {
      console.log("Failed to generate image after retries, proceeding without image");
      // Don't throw - just skip image update and continue with language detection
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
              content: `Detect the language of this text and respond with ONLY the 2-letter ISO 639-1 language code (e.g., "en" for English, "es" for Spanish, "de" for German, "fr" for French, "pt" for Portuguese, "it" for Italian). Just the code, nothing else. Text: "${title}${description ? ' - ' + description : ''}"`
            }
          ]
        })
      });
      
      if (langResponse.ok) {
        const langData = await langResponse.json();
        const langCode = langData.choices?.[0]?.message?.content?.trim().toLowerCase().slice(0, 2);
        console.log("Detected language code:", langCode);
        if (langCode && /^[a-z]{2}$/.test(langCode)) {
          detectedLanguage = langCode;
        }
      } else {
        const langError = await langResponse.text();
        console.error("Language detection failed:", langError);
      }
    } catch (langErr) {
      console.error("Language detection error:", langErr);
    }

    // Update the boost record
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const updateData: Record<string, string | null> = {
      original_language: detectedLanguage
    };
    
    if (imageBase64) {
      updateData.image_url = imageBase64;
    }

    const { error: updateError } = await supabase
      .from("tenant_custom_boosts")
      .update(updateData)
      .eq("id", boostId);

    if (updateError) {
      console.error("Error updating boost:", updateError);
      throw updateError;
    }

    console.log("Boost updated successfully:", { boostId, hasImage: !!imageBase64, detectedLanguage });

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageUrl: imageBase64 || null,
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
