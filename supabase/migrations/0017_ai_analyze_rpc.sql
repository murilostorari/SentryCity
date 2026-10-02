-- ai_analyze: RPC function for frontend URL ingestion
-- Reads GROQ_API_KEY from crawler_config (no env vars needed)

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
  err_msg text;
  attempt int := 0;
  system_prompt text := 'Você é um analista de OSINT. Extraia info de incidentes urbanos. Responda SOMENTE JSON: {"title":"","description":"","type":"accident|power|weather|pothole|show|party|noise|inauguration|other","severity":"low|medium|high|critical","confidence":0.5,"city":"","state":"SP","street":"","neighborhood":""}. Extraia rua, bairro e cidade do texto.';
  browser_ua text := 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
BEGIN
  api_key := (SELECT key_value FROM public.crawler_config WHERE key_name = 'groq_api_key');
  IF api_key IS NULL OR length(api_key) = 0 THEN
    RETURN jsonb_build_object('error', 'Groq API key not configured');
  END IF;

  IF news_text IS NULL OR length(trim(news_text)) < 10 THEN
    RETURN jsonb_build_object('error', 'News text too short');
  END IF;

  groq_body := jsonb_build_object(
    'model', model_name,
    'messages', jsonb_build_array(
      jsonb_build_object('role', 'system', 'content', system_prompt),
      jsonb_build_object('role', 'user', 'content', left(news_text, 8000))
    ),
    'temperature', 0.2,
    'response_format', jsonb_build_object('type', 'json_object')
  )::text;

  -- Retry up to 3 times (Groq can be flaky)
  FOR attempt IN 1..3 LOOP
    groq_response := public.http_post_json(
      'https://api.groq.com/openai/v1/chat/completions',
      groq_body, api_key, browser_ua
    );

    -- Parse response
    BEGIN
      groq_json := groq_response::jsonb;
    EXCEPTION WHEN OTHERS THEN
      PERFORM pg_sleep(1);
      CONTINUE;
    END;

    -- Check if Groq returned an error
    IF groq_json ? 'error' THEN
      err_msg := groq_json->'error'->>'message';
      -- Invalid model: rebuild body with the default model and retry
      IF coalesce(groq_json->'error'->>'code', '') = 'model_not_found'
         OR err_msg LIKE '%does not exist%' THEN
        groq_body := jsonb_build_object(
          'model', 'qwen/qwen3.8-27b',
          'messages', jsonb_build_array(
            jsonb_build_object('role', 'system', 'content', system_prompt),
            jsonb_build_object('role', 'user', 'content', left(news_text, 8000))
          ),
          'temperature', 0.2,
          'response_format', jsonb_build_object('type', 'json_object')
        )::text;
      END IF;
      PERFORM pg_sleep(1);
      CONTINUE;
    END IF;

    -- Extract content
    content := (groq_json->'choices'->0->'message'->>'content');

    IF content IS NOT NULL AND length(content) > 0 THEN
      -- Parse JSON
      BEGIN
        result := content::jsonb;
      EXCEPTION WHEN OTHERS THEN
        BEGIN
          result := substring(content FROM '\{[\s\S]*\}')::jsonb;
        EXCEPTION WHEN OTHERS THEN
          RETURN jsonb_build_object('error', 'Failed to parse AI response', 'content', left(content, 500));
        END;
      END;
      RETURN result;
    END IF;

    -- No content — wait and retry
    PERFORM pg_sleep(1);
  END LOOP;

  RETURN jsonb_build_object(
    'error', 'Groq API returned no content after 3 attempts',
    'last_error', coalesce(err_msg, 'unknown'),
    'raw', left(coalesce(groq_response, ''), 500)
  );
END;
$func$;

COMMENT ON FUNCTION public.ai_analyze(text, text) IS 'Analyze news text via Groq AI with retry. Frontend calls via supabase.rpc().';
