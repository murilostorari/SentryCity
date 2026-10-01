-- SQL Crawler v2.4: RSS + Google News RSS feeds
-- Reads API keys from crawler_config (NO hardcoded secrets)

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

CREATE OR REPLACE FUNCTION public.http_get_text(url text, user_agent text)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  resp record;
BEGIN
  SELECT * INTO resp FROM http(
    ('GET', url,
     array[
       http_header('User-Agent', user_agent),
       http_header('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9'),
       http_header('Accept-Language', 'pt-BR,pt;q=0.9')
     ],
     'text/html', '')::http_request
  );
  RETURN coalesce(resp.content, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.http_get_xml(url text, user_agent text)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  resp record;
BEGIN
  SELECT * INTO resp FROM http(
    ('GET', url,
     array[
       http_header('User-Agent', user_agent),
       http_header('Accept', 'application/xml,application/rss+xml,text/xml;q=0.9')
     ],
     'application/xml', '')::http_request
  );
  RETURN coalesce(resp.content, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.http_post_json(url text, body text, api_key text, user_agent text)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  resp record;
  hdrs http_header[];
BEGIN
  hdrs := array[
    http_header('Content-Type', 'application/json'),
    http_header('User-Agent', user_agent)
  ];

  IF api_key IS NOT NULL AND length(api_key) > 0 THEN
    hdrs := array_append(hdrs, http_header('Authorization', 'Bearer ' || api_key));
  END IF;

  SELECT * INTO resp FROM http(
    ('POST', url, hdrs, 'application/json', body)::http_request
  );
  RETURN coalesce(resp.content, '');
END;
$$;

DROP FUNCTION IF EXISTS public.run_sql_crawler();

CREATE OR REPLACE FUNCTION public.run_sql_crawler()
RETURNS jsonb
LANGUAGE plpgsql
AS $func$
DECLARE
  feed_rec record;
  feed_content text;
  single_url text;
  original_url text;
   item_title text;
   item_description text;
   v_url_hash text;
   already_exists boolean;
   v_source_id uuid;
  groq_api_key text;
  browser_ua text := 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  groq_body text;
  groq_response text;
  groq_json jsonb;
  relevant boolean;
  ai_type text;
  ai_confidence numeric;
  item_pubdate text;
  item_date timestamptz;
  geo_response text;
  geo_json jsonb;
  lat numeric := 0;
  lng numeric := 0;
  stat_feeds int := 0;
  stat_found int := 0;
  stat_relevant int := 0;
  stat_created int := 0;
  stat_errors text[] := '{}';
  ai_title text;
  ai_description text;
  ai_severity text;
  ai_city text;
  ai_state text;
   ai_street text;
BEGIN
  groq_api_key := public.get_crawler_key('groq_api_key');
  IF groq_api_key IS NULL THEN
    RETURN jsonb_build_object('error', 'Groq API key not configured in crawler_config');
  END IF;

  -- Process feeds: RSS + jina_search (Google News RSS)
  FOR feed_rec IN
    SELECT url, name, source_type FROM public.crawler_feeds
    WHERE source_type IN ('rss', 'jina_search') AND is_active = true
    ORDER BY name
  LOOP
    stat_feeds := stat_feeds + 1;

    -- Create/get source entry for this feed
    IF NOT EXISTS(SELECT 1 FROM public.sources WHERE name = feed_rec.name) THEN
      INSERT INTO public.sources (name, url, type, trust_score)
      VALUES (feed_rec.name, feed_rec.url, 'news', 0.8);
    END IF;
    SELECT id INTO v_source_id FROM public.sources WHERE name = feed_rec.name;

    BEGIN
      -- For jina_search feeds, use Google News RSS search endpoint
      IF feed_rec.source_type = 'jina_search' THEN
        feed_content := public.http_get_xml(
          'https://news.google.com/rss/search?q=' || replace(feed_rec.url, ' ', '+') ||
            '&hl=pt-BR&gl=BR&ceid=BR:pt-419',
          browser_ua
        );
      ELSE
        feed_content := public.http_get_xml(feed_rec.url, browser_ua);
      END IF;

      PERFORM pg_sleep(2);

      IF feed_content NOT LIKE '%<item%' THEN
        stat_errors := array_append(stat_errors, 'RSS: no items for ' || feed_rec.name);
        CONTINUE;
      END IF;

      -- Extract URLs, titles, and pubDate from RSS items (single pass)
      FOR single_url, item_title, item_pubdate, item_description IN
        WITH item_contents AS (
          SELECT (regexp_matches(feed_content, '<item[^>]*>\s*(.*?)\s*</item>', 'gis'))[1] as item_xml
        )
        SELECT
          trim((regexp_matches(item_xml, '<link[^>]*>\s*(https?://[^<\s]+)', 'is'))[1]) as url,
          trim(left(substring(item_xml FROM '<title[^>]*>([^<]*)</title>'), 500)) as title,
          substring(item_xml FROM '<pubDate[^>]*>(.*?)</pubDate>') as pubdate,
          left(regexp_replace(
            substring(item_xml FROM '<description[^>]*>(.*)</description>'),
            '<[^>]+>', ' ', 'g'
          ), 1000) as description
        FROM item_contents
        WHERE item_xml ~ '<link[^>]*>https?://'
        LIMIT 5
      LOOP

        stat_found := stat_found + 1;

        -- Date filtering: skip items older than 7 days
        item_date := NULL;
        IF item_pubdate IS NOT NULL THEN
          BEGIN
            -- Normalize Portuguese dates: strip day name, translate months
            item_pubdate := replace(item_pubdate, 'Set', 'Sep');
            item_pubdate := replace(item_pubdate, 'Fev', 'Feb');
            item_pubdate := replace(item_pubdate, 'Abr', 'Apr');
            item_pubdate := replace(item_pubdate, 'Mai', 'May');
            item_pubdate := replace(item_pubdate, 'Ago', 'Aug');
            item_pubdate := replace(item_pubdate, 'Out', 'Oct');
            item_pubdate := replace(item_pubdate, 'Dez', 'Dec');
            -- Try RFC 2822 format first
            item_date := to_timestamp(trim(item_pubdate), 'Dy, DD Mon YYYY HH24:MI:SS');
          EXCEPTION WHEN OTHERS THEN
            BEGIN
              -- Try without time
              item_date := to_timestamp(trim(item_pubdate), 'Dy, DD Mon YYYY');
            EXCEPTION WHEN OTHERS THEN
              -- Strip Portuguese day name and try numeric format
              BEGIN
                item_date := to_timestamp(substring(trim(item_pubdate) from '\d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2}'), 'DD Mon YYYY HH24:MI:SS');
              EXCEPTION WHEN OTHERS THEN
                BEGIN
                  item_date := to_timestamp(substring(trim(item_pubdate) from '\d{2} \w{3} \d{4}'), 'DD Mon YYYY');
                EXCEPTION WHEN OTHERS THEN
                  NULL;
                END;
              END;
            END;
          END;
        END IF;

        IF item_date IS NOT NULL AND item_date < now() - interval '7 days' THEN
          stat_errors := array_append(stat_errors, 'DateFiltered: ' || left(item_title, 60));
          CONTINUE;
        END IF;

        -- Extract actual URL from Google News redirect
        original_url := single_url;
        IF single_url LIKE 'https://news.google.com/rss/articles/%' THEN
          -- Try to get actual URL from description in item
          -- For now, keep the redirect URL
          NULL;
        END IF;

        -- Deduplicate
        v_url_hash := encode(digest(original_url, 'sha256'), 'hex');
        SELECT EXISTS(SELECT 1 FROM public.raw_reports rr WHERE rr.url_hash = v_url_hash) INTO already_exists;
        IF already_exists THEN
          CONTINUE;
        END IF;

        -- Save raw_report
        INSERT INTO public.raw_reports(
          original_text, original_url, url_hash, title, source_name,
          published_at, processed
        ) VALUES (
          item_title, original_url, v_url_hash,
          item_title, 'SQL Crawler RSS', now(), false
        )
        ON CONFLICT (url_hash) DO NOTHING;

        -- Stage 1: Relevance filter (with URL + title context)
        groq_body := jsonb_build_object(
          'model', 'qwen/qwen3.8-27b',
          'messages', jsonb_build_array(
            jsonb_build_object('role', 'system', 'content',
              'OSINT relevance filter. Return JSON with "relevant" boolean field. Only relevant if incident is in Adamantina, Lucélia, Osvaldo Cruz, Pacaembu, Dracena, Flórida Paulista, or Parapuã, SP. Relevant if: traffic accident, car/motorcycle crash, power outage, blackout, heavy rain, flooding, road damage, pothole, violence, road closure, incident report, urban events. Not relevant: politics, elections, entertainment, celebrities, sports, stock market, advertising, sponsored content.'
            ),
            jsonb_build_object('role', 'user', 'content',
              'Is this about a relevant urban incident in Adamantina or Lucélia, SP? URL: ' || left(original_url, 200) || ' Title: ' || coalesce(left(item_title, 300), '') || coalesce(' Summary: ' || left(item_description, 300), '')
            )
          ),
          'max_tokens', 250,
          'temperature', 0.1,
          'response_format', jsonb_build_object('type', 'json_object')
        )::text;

        groq_response := public.http_post_json(
          'https://api.groq.com/openai/v1/chat/completions', groq_body, groq_api_key, browser_ua
        );

        PERFORM pg_sleep(1);

        BEGIN
          IF groq_response IS NULL OR groq_response = '' THEN
            stat_errors := array_append(stat_errors, 'Groq empty: ' || left(original_url, 100));
            CONTINUE;
          END IF;
          groq_json := ((groq_response::jsonb)->'choices'->0->'message'->>'content')::jsonb;
          -- Handle both "relevant" and "is_relevant" field names
          relevant := COALESCE(
            NULLIF((groq_json->>'relevant'), '')::boolean,
            NULLIF((groq_json->>'is_relevant'), '')::boolean,
            NULLIF((groq_json->>'relevant_flag'), '')::boolean,
            false
          );
        IF NOT COALESCE(relevant, false) THEN
          CONTINUE;
        END IF;
        EXCEPTION WHEN OTHERS THEN
          stat_errors := array_append(stat_errors, 'Parse filter: ' || sqlerrm || ' | resp: ' || left(coalesce(groq_response, 'NULL'), 300));
          CONTINUE;
        END;

        IF NOT COALESCE(relevant, false) THEN
          CONTINUE;
        END IF;

        stat_relevant := stat_relevant + 1;

        -- Stage 2: Full analysis
        groq_body := jsonb_build_object(
          'model', 'qwen/qwen3.8-27b',
          'messages', jsonb_build_array(
            jsonb_build_object('role', 'system', 'content',
              'You are an OSINT analyst. Extract incident info from URL, title, and article summary. Return JSON with fields in Portuguese. Extract street and neighborhood if mentioned. type: accident/power/weather/pothole/show/party/noise/inauguration/other. Return JSON: {"title":"","description":"","type":"","severity":"","confidence":0.5,"city":"","state":"","street":"","neighborhood":""}'
            ),
            jsonb_build_object('role', 'user', 'content',
              'Extract incident info from URL, title, and summary. Response in Portuguese. Extract street and neighborhood address from the summary text. URL: ' || left(original_url, 200) || ' Title: ' || coalesce(left(item_title, 300), '') || coalesce(' Summary: ' || left(item_description, 500), '')
            )
          ),
          'max_tokens', 500,
          'temperature', 0.2,
          'response_format', jsonb_build_object('type', 'json_object')
        )::text;

        groq_response := public.http_post_json(
          'https://api.groq.com/openai/v1/chat/completions', groq_body, groq_api_key, browser_ua
        );

        PERFORM pg_sleep(1);

        BEGIN
          IF groq_response IS NULL OR groq_response = '' THEN
            stat_errors := array_append(stat_errors, 'Groq empty Stage2: ' || left(original_url, 100));
            ai_title := 'Incidente detectado via crawler';
            ai_description := item_title;
            ai_type := 'other';
            ai_severity := 'medium';
            ai_city := 'Adamantina';
            ai_state := 'SP';
            ai_confidence := 0.3;
            ai_street := '';
            lat := -22.32;
            lng := -49.99;
          ELSE
            groq_json := ((groq_response::jsonb)->'choices'->0->'message'->>'content')::jsonb;
            ai_title := groq_json->>'title';
            ai_description := groq_json->>'description';
            ai_type := groq_json->>'type';
            ai_severity := groq_json->>'severity';
            ai_city := groq_json->>'city';
            ai_state := groq_json->>'state';
            ai_street := groq_json->>'street';
            ai_confidence := COALESCE((groq_json->>'confidence')::numeric, 0.5);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          stat_errors := array_append(stat_errors, 'Parse Stage2: ' || sqlerrm || ' | resp: ' || left(coalesce(groq_response, 'NULL'), 300) || ' | url: ' || left(original_url, 100));
          ai_title := 'Incidente detectado via crawler';
          ai_description := coalesce(item_title, original_url);
          ai_type := 'other';
          ai_severity := 'medium';
          ai_city := 'Adamantina';
          ai_state := 'SP';
          ai_confidence := 0.3;
          ai_street := '';
          lat := -22.32;
          lng := -49.99;
        END;

        -- Defaults
        ai_title := COALESCE(NULLIF(ai_title, ''), 'Incidente detectado via crawler');
        ai_description := COALESCE(NULLIF(ai_description, ''), original_url);
        ai_type := COALESCE(NULLIF(ai_type, ''), 'other');
        ai_severity := COALESCE(NULLIF(ai_severity, ''), 'medium');
        ai_city := COALESCE(NULLIF(ai_city, ''), 'Adamantina');
        ai_state := COALESCE(NULLIF(ai_state, ''), 'SP');

        -- Normalize type
        ai_type := lower(ai_type);
        IF ai_type LIKE '%accid%' OR ai_type LIKE '%crash%' OR ai_type LIKE '%colis%' OR ai_type LIKE '%batida%' THEN
          ai_type := 'traffic_accident';
        ELSIF ai_type LIKE '%fire%' OR ai_type LIKE '%incendi%' OR ai_type LIKE '%fogo%' THEN
          ai_type := 'fire';
        ELSIF ai_type LIKE '%power%' OR ai_type LIKE '%energi%' OR ai_type LIKE '%blackout%' OR ai_type LIKE '%desligamento%' THEN
          ai_type := 'power_outage';
        ELSIF ai_type LIKE '%rain%' OR ai_type LIKE '%chuv%' OR ai_type LIKE '%aluvi%' OR ai_type LIKE '%enchent%' OR ai_type LIKE '%flood%' OR ai_type LIKE '%weather%' OR ai_type LIKE '%temporal%' THEN
          ai_type := 'flood';
        ELSIF ai_type LIKE '%pothole%' OR ai_type LIKE '%buraco%' OR ai_type LIKE '%road damage%' OR ai_type LIKE '%infra%' THEN
          ai_type := 'infrastructure_damage';
        ELSIF ai_type LIKE '%violence%' OR ai_type LIKE '%violência%' OR ai_type LIKE '%crime%' THEN
          ai_type := 'violence';
        ELSIF ai_type LIKE '%closure%' OR ai_type LIKE '%interdi%' THEN
          ai_type := 'road_closure';
        ELSE
          ai_type := 'other';
        END IF;

        -- Normalize severity
        ai_severity := lower(ai_severity);
        IF ai_severity LIKE '%fatal%' OR ai_severity LIKE '%critical%' THEN
          ai_severity := 'high';
        ELSIF ai_severity LIKE '%high%' OR ai_severity LIKE '%severe%' THEN
          ai_severity := 'high';
        ELSIF ai_severity LIKE '%medium%' OR ai_severity LIKE '%moderate%' THEN
          ai_severity := 'medium';
        ELSIF ai_severity LIKE '%low%' THEN
          ai_severity := 'low';
        ELSE
          ai_severity := 'medium';
        END IF;

        -- Geocoding via Nominatim
        geo_response := public.http_get_text(
          'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=br&q=' ||
            replace(replace(ai_city || ' ' || COALESCE(ai_street, ''), ' ', '+'), '''', '%27'),
          browser_ua
        );

        PERFORM pg_sleep(1);

        BEGIN
          IF geo_response != '' AND geo_response != '[]' THEN
            geo_json := geo_response::jsonb;
            IF jsonb_array_length(geo_json) > 0 THEN
              lat := (geo_json->0->>'lat')::numeric;
              lng := (geo_json->0->>'lon')::numeric;
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;

        IF lat = 0 OR lng = 0 THEN
          lat := -22.32;
          lng := -49.99;
        END IF;

        -- Create incident (source includes feed name for attribution)
        IF NOT EXISTS(SELECT 1 FROM public.incidents WHERE source = 
          CASE 
            WHEN original_url LIKE 'https://news.google.com/rss/articles/%' THEN
              feed_rec.name || ' | ' || original_url
            ELSE
              substring(original_url from 'https?://(?:www\.)?([^/]+)') || ' | ' || original_url
          END
        ) THEN
           INSERT INTO public.incidents(
             title, description, type, severity, status,
             latitude, longitude, address, city, state,
             confidence_score, source, source_id, reported_at
          ) VALUES (
            ai_title, ai_description, ai_type,
            CASE lower(ai_severity)
              WHEN 'low' THEN 'low'::incident_severity
              WHEN 'medium' THEN 'medium'::incident_severity
              WHEN 'high' THEN 'high'::incident_severity
              WHEN 'critical' THEN 'critical'::incident_severity
              ELSE 'medium'::incident_severity
            END,
            'active', lat, lng,
            COALESCE(ai_street, ''), ai_city, ai_state,
             ai_confidence, 
             CASE 
               WHEN original_url LIKE 'https://news.google.com/rss/articles/%' THEN
                 feed_rec.name || ' | ' || original_url
               ELSE
                 substring(original_url from 'https?://(?:www\.)?([^/]+)') || ' | ' || original_url
             END,
             v_source_id,
             now()
          );
          stat_created := stat_created + 1;
        END IF;

      END LOOP;

    EXCEPTION WHEN OTHERS THEN
      stat_errors := array_append(stat_errors, 'Feed ' || feed_rec.name || ': ' || sqlerrm);
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

COMMENT ON FUNCTION public.run_sql_crawler() IS 'Crawler v2.4: RSS+GoogleNews feeds with title extraction and proper JSONB parsing. Key via crawler_config table.';
