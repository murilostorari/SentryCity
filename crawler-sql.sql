-- SQL Crawler for SentryCity
-- Uses http extension (synchronous) with browser-like headers
-- Stores Groq API key in crawler_config table (NOT hardcoded for security)

-- Helper: URL decode percent-encoded strings
CREATE OR REPLACE FUNCTION public.url_decode(s text)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  result text := s;
BEGIN
  result := Replace(result, '%2F', '/');
  result := Replace(result, '%3A', ':');
  result := Replace(result, '%3F', '?');
  result := Replace(result, '%3D', '=');
  result := Replace(result, '%26', '&');
  result := Replace(result, '%25', '%');
  result := Replace(result, '%2C', ',');
  result := Replace(result, '%27', '''');
  result := Replace(result, '%28', '(');
  result := Replace(result, '%29', ')');
  result := Replace(result, '%2B', '+');
  result := Replace(result, '%20', ' ');
  result := Replace(result, '%2D', '-');
  return result;
END;
$$;

-- Config table for API keys (set via SQL, not in migrations)
CREATE TABLE IF NOT EXISTS public.crawler_config (
  key_name  text PRIMARY KEY,
  key_value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.crawler_config IS 'Stores API keys for crawler (set via SQL, not version controlled)';

-- Helper to get API key
CREATE OR REPLACE FUNCTION public.get_crawler_key(name text)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  result text;
BEGIN
  SELECT key_value INTO result FROM public.crawler_config WHERE key_name = name;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_sql_crawler()
RETURNS jsonb
LANGUAGE plpgsql
AS $func$
DECLARE
  feed_rec record;
  ddg_result record;
  html_content text;
  single_url text;
  v_url_hash text;
  already_exists boolean;
  groq_result record;
  groq_json jsonb;
  relevant boolean;
  incident_type text;
  stat_feeds int := 0;
  stat_found int := 0;
  stat_relevant int := 0;
  stat_created int := 0;
  stat_errors text[] := '{}';
  browser_ua text := 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  groq_api_key text;
  groq_body text;
BEGIN
  -- Get Groq API key from config (NOT hardcoded)
  groq_api_key := public.get_crawler_key('groq_api_key');
  IF groq_api_key IS NULL THEN
    RETURN jsonb_build_object(
      'feeds', 0, 'found', 0, 'relevant', 0, 'created', 0,
      'errors', array_append(stat_errors, 'Groq API key not configured in crawler_config')
    );
  END IF;

  FOR feed_rec IN
    SELECT url, name FROM public.crawler_feeds
    WHERE source_type = 'jina_search' AND is_active = true
  LOOP
    stat_feeds := stat_feeds + 1;

    BEGIN
      -- 1. DuckDuckGo search (with browser UA to avoid bot detection)
      SELECT * INTO ddg_result FROM http(
        ('GET',
         'https://html.duckduckgo.com/html/?q=' || replace(feed_rec.url, ' ', '+'),
         array[
           http_header('User-Agent', browser_ua),
           http_header('Accept', 'text/html,application/xhtml+xml'),
           http_header('Accept-Language', 'pt-BR,pt;q=0.9')
         ],
         'text/html',
         '')::http_request
      );

      PERFORM pg_sleep(1);

      IF ddg_result.status != 200 THEN
        stat_errors := array_append(stat_errors, 'DDG: ' || ddg_result.status);
        CONTINUE;
      END IF;

      html_content := COALESCE(ddg_result.content, '');

      -- 2. Extract URLs (DDG redirect format: uddg=...), limit 8 per feed
      FOR single_url IN
        WITH url_matches AS (
          SELECT (regexp_matches(html_content, 'uddg=([^ &"<>]+)', 'g'))[1] as raw_url
        )
        SELECT public.url_decode(raw_url) as url FROM url_matches LIMIT 8
      LOOP
        IF single_url IS NULL OR single_url NOT LIKE 'https://%' THEN
          CONTINUE;
        END IF;
        IF single_url LIKE '%duckduckgo%' THEN
          CONTINUE;
        END IF;

        stat_found := stat_found + 1;

        -- 3. Deduplicate by URL hash
        v_url_hash := encode(digest(single_url, 'sha256'), 'hex');
        SELECT EXISTS(SELECT 1 FROM public.raw_reports rr WHERE rr.url_hash = v_url_hash) INTO already_exists;
        IF already_exists THEN
          CONTINUE;
        END IF;

        -- 4. Groq relevance filter (Stage 1)
        groq_body := jsonb_build_object(
          'model', 'qwen/qwen3.8-27b',
          'messages', jsonb_build_array(
            jsonb_build_object('role', 'system', 'content',
              'Você é um filtro OSINT para json. Relevante: acidentes, energia, chuva, alagamento, buraco, violência, interdição. Não relevante: política, entretenimento. JSON: {"relevant":true,"type":"accident","reason":"ok"}'
            ),
            jsonb_build_object('role', 'user', 'content',
              'Verifique se esta URL é sobre um incidente urbano relevante: ' || single_url
            )
          ),
          'max_tokens', 150,
          'temperature', 0.1,
          'response_format', jsonb_build_object('type', 'json_object')
        )::text;

        SELECT * INTO groq_result FROM http(
          ('POST',
           'https://api.groq.com/openai/v1/chat/completions',
           array[
             http_header('Authorization', 'Bearer ' || groq_api_key),
             http_header('Content-Type', 'application/json'),
             http_header('User-Agent', browser_ua)
           ],
           'application/json',
           groq_body)::http_request
        );

        PERFORM pg_sleep(2);

        IF groq_result.status != 200 THEN
          stat_errors := array_append(stat_errors, 'Groq: ' || groq_result.status);
          CONTINUE;
        END IF;

        -- Parse Groq response
        BEGIN
          groq_json := ((groq_result.content::json)->'choices'->0->'message'->>'content')::jsonb;
          relevant := (groq_json->>'relevant')::boolean;
          incident_type := groq_json->>'type';
        EXCEPTION WHEN OTHERS THEN
          relevant := false;
          stat_errors := array_append(stat_errors, 'Parse: ' || sqlerrm);
          CONTINUE;
        END;

        IF NOT relevant THEN
          CONTINUE;
        END IF;

        stat_relevant := stat_relevant + 1;

        -- 5. Create raw_report
        INSERT INTO public.raw_reports(
          original_text, original_url, url_hash, title, source_name,
          published_at, processed
        ) VALUES (
          single_url, single_url, v_url_hash,
          'Incidente via SQL Crawler', 'SQL Crawler DDG',
          now(), false
        )
        ON CONFLICT (url_hash) DO NOTHING;

        -- 6. Create incident
        IF NOT EXISTS(SELECT 1 FROM public.incidents WHERE title LIKE '%' || single_url) THEN
          INSERT INTO public.incidents(
            title, description, type, severity, status,
            latitude, longitude, city, state, confidence_score, source, reported_at
          ) VALUES (
            'Incidente via SQL Crawler - ' || COALESCE(incident_type, 'other'),
            'Detectado via DuckDuckGo: ' || single_url,
            COALESCE(incident_type, 'other'), 'medium', 'active',
            -22.32, -49.99,
            'Adamantina', 'SP', 0.5,
            'SQL Crawler DDG', now()
          );
          stat_created := stat_created + 1;
        END IF;

      END LOOP;

    EXCEPTION WHEN OTHERS THEN
      stat_errors := array_append(stat_errors, 'Feed: ' || sqlerrm);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'feeds', stat_feeds,
    'found', stat_found,
    'relevant', stat_relevant,
    'created', stat_created,
    'errors', stat_errors
  );
END;
$func$;

COMMENT ON FUNCTION public.run_sql_crawler() IS 'Crawler OSINT puro SQL: DuckDuckGo→Groq→Incidentes. Config key: INSERT INTO crawler_config VALUES (''groq_api_key'', ''sua_key'')';
