-- Create ai_analyze RPC function that frontend can call via supabase.rpc('ai_analyze', {news_text: ...})
-- This reads GROQ_API_KEY from crawler_config table (no env vars needed)

CREATE OR REPLACE FUNCTION public.ai_analyze(news_text text, model_name text DEFAULT 'qwen/qwen3.8-27b')
RETURNS jsonb
LANGUAGE plpgsql
AS $func$
DECLARE
  api_key text;
  groq_body text;
  groq_response text;
  groq_json jsonb;
  content text;
  result jsonb;
  system_prompt text := 'Você é um analista de OSINT. Extraia info de incidentes urbanos. Responda SOMENTE JSON: {"title":"","description":"","type":"accident|power|weather|pothole|show|party|noise|inauguration|other","severity":"low|medium|high|critical","confidence":0.5,"city":"","state":"SP","street":"","neighborhood":""}. Extraia rua, bairro e cidade do texto.';
  browser_ua text := 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
BEGIN
  -- Get API key from config table
  api_key := (SELECT key_value FROM public.crawler_config WHERE key_name = 'groq_api_key');
  IF api_key IS NULL OR length(api_key) = 0 THEN
    RETURN jsonb_build_object('error', 'Groq API key not configured');
  END IF;

  IF news_text IS NULL OR length(trim(news_text)) < 10 THEN
    RETURN jsonb_build_object('error', 'News text too short');
  END IF;

  -- Build Groq request body
  groq_body := jsonb_build_object(
    'model', model_name,
    'messages', jsonb_build_array(
      jsonb_build_object('role', 'system', 'content', system_prompt),
      jsonb_build_object('role', 'user', 'content', left(news_text, 8000))
    ),
    'temperature', 0.2,
    'response_format', jsonb_build_object('type', 'json_object')
  )::text;

  -- Call Groq via http extension (same as crawler uses)
  groq_response := public.http_post_json(
    'https://api.groq.com/openai/v1/chat/completions',
    groq_body,
    api_key,
    browser_ua
  );

  -- Parse response
  groq_json := groq_response::jsonb;

  -- Extract content using the known-safe pattern (same as crawler)
  content := ((groq_json->'choices'->0->'message')#>>'{"content"}'::text[]);

  IF content IS NULL OR content = '' THEN
    RETURN jsonb_build_object('error', 'No content in Groq response', 'raw', groq_json);
  END IF;

  -- Parse JSON (handle markdown fences)
  BEGIN
    result := content::jsonb;
  EXCEPTION WHEN OTHERS THEN
    -- Try extracting JSON object
    BEGIN
      result := substring(content FROM '\{[\s\S]*\}')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('error', 'Failed to parse AI response', 'content', content);
    END;
  END;

  RETURN result;
END;
$func$;

COMMENT ON FUNCTION public.ai_analyze(text, text) IS 'Analyze news text via Groq AI. Called by frontend via supabase.rpc().';
