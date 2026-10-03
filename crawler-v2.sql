-- SQL Crawler v2.5: RSS + Google News RSS feeds
-- Reads API keys from crawler_config (NO hardcoded secrets)
-- v2.5: resolve Google News redirect -> fetch article body -> address extraction
--       + Nominatim/Photon geocoding with per-city fallback

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
       http_header('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'),
       http_header('Accept-Language', 'pt-BR,pt;q=0.9,en;q=0.8'),
       http_header('Accept-Encoding', 'identity'),
       http_header('Sec-Fetch-Dest', 'document'),
       http_header('Sec-Fetch-Mode', 'navigate'),
       http_header('Sec-Fetch-Site', 'none'),
       http_header('Upgrade-Insecure-Requests', '1')
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

CREATE OR REPLACE FUNCTION public.url_encode(t text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  r text := '';
  i int;
  ch text;
BEGIN
  IF t IS NULL THEN RETURN ''; END IF;
  FOR i IN 1..length(t) LOOP
    ch := substr(t, i, 1);
    IF ch ~ '[A-Za-z0-9_.~-]' OR octet_length(ch) > 1 THEN
      r := r || ch;
    ELSE
      r := r || '%' || upper(to_hex(ascii(ch)));
    END IF;
  END LOOP;
  RETURN r;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.http_post_form(url text, body text, user_agent text, referer text)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  resp record;
BEGIN
  SELECT * INTO resp FROM http(
    ('POST', url,
     array[
       http_header('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8'),
       http_header('User-Agent', user_agent),
       http_header('Origin', 'https://news.google.com'),
       http_header('Referer', referer),
       http_header('X-Goog-Encode-Response-If-Executable', '1')
     ],
     'application/x-www-form-urlencoded', body)::http_request
  );
  RETURN coalesce(resp.content, '');
END;
$fn$;

-- Resolve a Google News redirect (news.google.com/rss/articles/...) to the
-- real article URL using the DotsSplashUi batchexecute endpoint.
-- Returns NULL when resolution fails (caller keeps the redirect URL).
CREATE OR REPLACE FUNCTION public.resolve_google_news_url(gn_url text, user_agent text)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  art_id text;
  page text;
  sg text;
  ts text;
  inner_json text;
  freq text;
  resp text;
  real_url text;
BEGIN
  art_id := substring(gn_url from 'news\.google\.com/rss/articles/([^?&/\s]+)');
  IF art_id IS NULL OR art_id = '' THEN
    RETURN NULL;
  END IF;

  page := public.http_get_text(gn_url, user_agent);
  IF page IS NULL OR length(page) < 500 THEN
    RETURN NULL;
  END IF;

  sg := substring(page from 'data-n-a-sg="([^"]+)"');
  ts := substring(page from 'data-n-a-ts="([^"]+)"');
  IF sg IS NULL OR ts IS NULL THEN
    RETURN NULL;
  END IF;

  inner_json := '["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"'
    || art_id || '",' || ts || ',"' || replace(sg, '"', '\"') || '"]';
  freq := '[[["Fbv4je",' || to_json(inner_json) || ',null,"generic"]]]';

  resp := public.http_post_form(
    'https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je',
    'f.req=' || public.url_encode(freq),
    user_agent,
    gn_url
  );
  IF resp IS NULL OR resp = '' THEN
    RETURN NULL;
  END IF;

  real_url := substring(resp from 'garturlres\\",\\"(https:[^"\\]+)');
  IF real_url IS NULL OR real_url = '' OR real_url LIKE '%google.com%' THEN
    RETURN NULL;
  END IF;
  RETURN real_url;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$fn$;

-- Build a *.translate.goog proxy URL (Google fetches the page server-side,
-- bypassing Cloudflare challenges that block our libcurl fingerprint).
CREATE OR REPLACE FUNCTION public.translate_goog_url(article_url text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  host text;
  rest text;
BEGIN
  host := substring(article_url from '^(?:https?://)([^/:?#]+)');
  IF host IS NULL THEN
    RETURN NULL;
  END IF;
  rest := substring(article_url from '^https?://[^/?#]+(.*)$');
  RETURN 'https://' || replace(host, '.', '-') || '.translate.goog' ||
    coalesce(nullif(rest, ''), '/') ||
    CASE WHEN rest LIKE '%?%' THEN '&' ELSE '?' END ||
    '_x_tr_sl=pt&_x_tr_tl=en&_x_tr_hl=pt-BR';
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$fn$;

-- Remove <script>...</script> / <style>...</style> blocks with a manual
-- position loop (PG's lazy regex behaves unpredictably across multiple pairs).
CREATE OR REPLACE FUNCTION public.strip_html_blocks(p text, p_tag text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  low text;
  open_pos int;
  gt_rel int;
  open_end int;
  close_rel int;
  close_abs int;
  tag_close text;
  safety int := 0;
BEGIN
  IF p IS NULL THEN RETURN ''; END IF;
  low := lower(p);
  tag_close := '</' || p_tag || '>';
  LOOP
    open_pos := strpos(low, '<' || p_tag);
    EXIT WHEN open_pos = 0 OR safety > 2000;
    gt_rel := strpos(substring(low from open_pos), '>');
    IF gt_rel = 0 THEN EXIT; END IF;
    open_end := open_pos + gt_rel - 1;
    close_rel := strpos(substring(low from open_end + 1), tag_close);
    IF close_rel = 0 THEN
      p := overlay(p placing ' ' from open_pos for (open_end - open_pos + 1));
    ELSE
      close_abs := open_end + close_rel;
      p := overlay(p placing ' ' from open_pos for (close_abs + length(tag_close) - open_pos));
    END IF;
    low := lower(p);
    safety := safety + 1;
  END LOOP;
  RETURN p;
END;
$fn$;

-- Fetch an article page and return plain text (article/main/body preferred,
-- tags stripped, common entities decoded, capped at 6000 chars).
CREATE OR REPLACE FUNCTION public.fetch_article_text(article_url text, user_agent text)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  html text;
  body text;
  tg text;
  is_bad boolean;
BEGIN
  html := public.http_get_text(article_url, user_agent);
  is_bad := html IS NULL OR length(html) < 300
    OR html LIKE '%<title>Just a moment%</title>%'
    OR html LIKE '%_cf_chl_%'
    OR html LIKE '%cf-browser-verification%';

  -- Cloudflare challenge / blocked / too small -> Google translate proxy
  IF is_bad THEN
    tg := public.translate_goog_url(article_url);
    IF tg IS NOT NULL THEN
      html := public.http_get_text(tg, user_agent);
      is_bad := html IS NULL OR length(html) < 300
        OR html LIKE '%<title>Just a moment%</title>%'
        OR html LIKE '%_cf_chl_%';
    END IF;
  END IF;

  -- Last resort: Jina Reader
  IF is_bad THEN
    html := public.http_get_text('https://r.jina.ai/' || article_url, user_agent);
    IF html IS NULL OR html LIKE '%AbuseAlleviationError%' OR html LIKE '%"code":403%' THEN
      RETURN '';
    END IF;
  END IF;

  IF html IS NULL OR length(html) < 300 THEN
    RETURN '';
  END IF;

  html := regexp_replace(html, '<!--.*?-->', ' ', 'gs');

  -- Prefer the article/main/body fragment (extract BEFORE script/style removal:
  -- whole-page script stripping can swallow the document when tags are unpaired)
  body := substring(html from '(?is)<article[^>]*>(.*?)</article>');
  IF body IS NULL OR length(body) < 200 THEN
    body := substring(html from '(?is)<main[^>]*>(.*?)</main>');
  END IF;
  IF body IS NULL OR length(body) < 200 THEN
    body := substring(html from '(?is)<body[^>]*>(.*?)</body>');
  END IF;
  IF body IS NULL OR length(body) < 200 THEN
    body := html;
  END IF;

  -- Remove script/style blocks (manual loop: PG lazy regex is unreliable
  -- across multiple pairs); JS/CSS residue is only kept as fallback noise
  body := public.strip_html_blocks(body, 'script');
  body := public.strip_html_blocks(body, 'style');

  body := regexp_replace(body, '<[^>]+>', ' ', 'g');
  body := regexp_replace(body, '(?i)&nbsp;|&#160;', ' ', 'g');
  body := regexp_replace(body, '(?i)&amp;', '&', 'g');
  body := regexp_replace(body, '(?i)&quot;|&#34;', '"', 'g');
  body := regexp_replace(body, '(?i)&apos;|&#39;', '''', 'g');
  body := regexp_replace(body, '(?i)&lt;', '<', 'g');
  body := regexp_replace(body, '(?i)&gt;', '>', 'g');
  body := regexp_replace(body, '(?i)&aacute;', 'á', 'g');
  body := regexp_replace(body, '(?i)&agrave;', 'à', 'g');
  body := regexp_replace(body, '(?i)&acirc;', 'â', 'g');
  body := regexp_replace(body, '(?i)&atilde;', 'ã', 'g');
  body := regexp_replace(body, '(?i)&eacute;', 'é', 'g');
  body := regexp_replace(body, '(?i)&ecirc;', 'ê', 'g');
  body := regexp_replace(body, '(?i)&iacute;', 'í', 'g');
  body := regexp_replace(body, '(?i)&oacute;', 'ó', 'g');
  body := regexp_replace(body, '(?i)&ocirc;', 'ô', 'g');
  body := regexp_replace(body, '(?i)&otilde;', 'õ', 'g');
  body := regexp_replace(body, '(?i)&uacute;', 'ú', 'g');
  body := regexp_replace(body, '(?i)&ccedil;', 'ç', 'g');
  body := regexp_replace(body, '\s+', ' ', 'g');
  body := trim(body);

  IF body IS NULL OR length(body) < 50 THEN
    RETURN '';
  END IF;
  RETURN left(body, 6000);
EXCEPTION WHEN OTHERS THEN
  RETURN '';
END;
$fn$;

-- Geocode a local address: Nominatim full address -> Photon fallback ->
-- per-city center. Guards against far-away matches (>0.3 deg from center).
CREATE OR REPLACE FUNCTION public.geocode_address(
  p_street text, p_number text, p_neighborhood text, p_city text, p_user_agent text,
  OUT o_lat numeric, OUT o_lng numeric)
LANGUAGE plpgsql AS $fn$
DECLARE
  q text;
  resp text;
  j jsonb;
  center_lat numeric;
  center_lng numeric;
  res_lat numeric;
  res_lng numeric;
BEGIN
  o_lat := 0; o_lng := 0;
  center_lat := CASE p_city
    WHEN 'Adamantina' THEN -21.6866517
    WHEN 'Lucélia' THEN -21.72110
    WHEN 'Osvaldo Cruz' THEN -21.79630
    WHEN 'Pacaembu' THEN -21.85670
    WHEN 'Dracena' THEN -21.48480
    WHEN 'Flórida Paulista' THEN -21.61410
    WHEN 'Parapuã' THEN -21.78130
    ELSE -21.6866517
  END;
  center_lng := CASE p_city
    WHEN 'Adamantina' THEN -51.0762975
    WHEN 'Lucélia' THEN -51.01880
    WHEN 'Osvaldo Cruz' THEN -50.87910
    WHEN 'Pacaembu' THEN -51.26060
    WHEN 'Dracena' THEN -51.60400
    WHEN 'Flórida Paulista' THEN -51.17300
    WHEN 'Parapuã' THEN -50.79220
    ELSE -51.0762975
  END;

  q := trim(
    COALESCE(NULLIF(p_street, ''), '') ||
    CASE WHEN COALESCE(p_number, '') <> '' THEN ', ' || p_number ELSE '' END ||
    CASE WHEN COALESCE(p_neighborhood, '') <> '' THEN ', ' || p_neighborhood ELSE '' END ||
    ', ' || COALESCE(NULLIF(p_city, ''), 'Adamantina') || ', SP'
  );

  -- 1) Nominatim
  resp := public.http_get_text(
    'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=br&q=' ||
    replace(replace(q, ' ', '+'), '''', '%27'),
    p_user_agent
  );
  PERFORM pg_sleep(1);
  BEGIN
    IF resp IS NOT NULL AND resp <> '' AND resp <> '[]' THEN
      j := resp::jsonb;
      IF jsonb_array_length(j) > 0 THEN
        res_lat := (j->0->>'lat')::numeric;
        res_lng := (j->0->>'lon')::numeric;
        IF abs(res_lat - center_lat) <= 0.3 AND abs(res_lng - center_lng) <= 0.3 THEN
          o_lat := res_lat; o_lng := res_lng;
          RETURN;
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 2) Photon fallback (biased at city center)
  resp := public.http_get_text(
    'https://photon.komoot.io/api/?limit=1&lat=' || center_lat::text || '&lon=' || center_lng::text ||
    '&q=' || replace(replace(q, ' ', '+'), '''', '%27'),
    p_user_agent
  );
  BEGIN
    IF resp IS NOT NULL AND resp <> '' THEN
      j := resp::jsonb;
      IF jsonb_array_length(coalesce(j->'features', '[]'::jsonb)) > 0 THEN
        res_lat := (j->'features'->0->'geometry'->'coordinates'->>1)::numeric;
        res_lng := (j->'features'->0->'geometry'->'coordinates'->>0)::numeric;
        IF abs(res_lat - center_lat) <= 0.3 AND abs(res_lng - center_lng) <= 0.3 THEN
          o_lat := res_lat; o_lng := res_lng;
          RETURN;
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 3) City center fallback
  o_lat := center_lat;
  o_lng := center_lng;
EXCEPTION WHEN OTHERS THEN
  o_lat := -21.6866517;
  o_lng := -51.0762975;
END;
$fn$;

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
   item_source_url text;
   item_source_name text;
   v_url_hash text;
   already_exists boolean;
   v_source_id uuid;
   v_display_source text;
   v_display_source_url text;
   v_source_display text;
   v_incident_id uuid;
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
   stat_merged int := 0;
   v_merge_id uuid;
   v_cand_id uuid;
   v_merge_same boolean := false;
   v_same_body text;
   v_same_response text;
   existing_title text;
   existing_desc text;
   stat_errors text[] := '{}';
   stat_groq int := 0;
   v_budget_done boolean := false;
  ai_title text;
  ai_description text;
  ai_severity text;
  ai_city text;
  ai_state text;
    ai_street text;
   ai_neighborhood text;
   ai_number text;
   ai_cross_street text;
    v_new_address text;
    v_real_url text;
    v_resolved_url text;
    v_article_text text;
    v_search_text text;
    v_mentioned_city text;
    stat_region_rejected int := 0;
 BEGIN
  groq_api_key := public.get_crawler_key('groq_api_key');
  IF groq_api_key IS NULL THEN
    RETURN jsonb_build_object('error', 'Groq API key not configured in crawler_config');
  END IF;

  -- Process feeds: RSS + jina_search (Google News RSS)
  FOR feed_rec IN
    SELECT url, name, source_type FROM public.crawler_feeds
    WHERE source_type IN ('rss', 'jina_search') AND is_active = true
    ORDER BY md5(name || clock_timestamp()::text)
  LOOP
    EXIT WHEN v_budget_done;
    stat_feeds := stat_feeds + 1;

    -- Create/get source entry for this feed
    IF NOT EXISTS(SELECT 1 FROM public.sources WHERE name = feed_rec.name) THEN
      INSERT INTO public.sources (name, url, type, trust_score)
      VALUES (feed_rec.name, feed_rec.url, 'news', 0.8);
    END IF;
    SELECT id INTO v_source_id FROM public.sources WHERE name = feed_rec.name;

    BEGIN
      -- For jina_search feeds, use Google News RSS search endpoint with 7-day recency filter
      IF feed_rec.source_type = 'jina_search' THEN
        feed_content := public.http_get_xml(
          'https://news.google.com/rss/search?q=' || replace(feed_rec.url, ' ', '+') ||
            '+when:7d&hl=pt-BR&gl=BR&ceid=BR:pt-419',
          browser_ua
        );
      ELSE
        feed_content := public.http_get_xml(feed_rec.url, browser_ua);
      END IF;

      PERFORM pg_sleep(1);

      IF feed_content NOT LIKE '%<item%' THEN
        stat_errors := array_append(stat_errors, 'RSS: no items for ' || feed_rec.name);
        CONTINUE;
      END IF;

      -- Extract URLs, titles, pubDate, and source from RSS items (single pass)
      FOR single_url, item_title, item_pubdate, item_description, item_source_url, item_source_name IN
        WITH item_contents AS (
          SELECT (regexp_matches(feed_content, '<item.*?>(.*?)</item>', 'gis'))[1] as item_xml
        )
        SELECT
          trim((regexp_matches(item_xml, '<link[^>]*>\s*(https?://[^<\s]+)', 'is'))[1]) as url,
          trim(left(substring(item_xml FROM '<title[^>]*>([^<]*)</title>'), 500)) as title,
          substring(item_xml FROM '<pubDate[^>]*>(.*?)</pubDate>') as pubdate,
          left(regexp_replace(
            substring(item_xml FROM '<description[^>]*>(.*)</description>'),
            '<[^>]+>', ' ', 'g'
          ), 1000) as description,
          substring(item_xml FROM '<source[^>]*url="([^"]*)"') as source_url,
          substring(item_xml FROM '<source[^>]*>([^<]*)</source>') as source_name
        FROM item_contents
        WHERE item_xml ~ '<link[^>]*>https?://'
        LIMIT 20
      LOOP

        -- Budget: max 40 articles evaluated per run (keeps run under statement_timeout)
        IF stat_groq >= 40 THEN
          v_budget_done := true;
          EXIT;
        END IF;

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

        IF item_date IS NOT NULL AND item_date < now() - interval '30 days' THEN
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
        -- Skip only if already linked to an incident or already evaluated;
        -- unlinked+unevaluated rows (old prompt or parse failure) are retried
        SELECT EXISTS(
          SELECT 1 FROM public.raw_reports rr
          WHERE rr.url_hash = v_url_hash
            AND (rr.incident_id IS NOT NULL OR rr.processed = true)
        ) INTO already_exists;
        IF already_exists THEN
          CONTINUE;
        END IF;

        -- Save raw_report (with extracted source name)
        INSERT INTO public.raw_reports(
          original_text, original_url, url_hash, title, source_name,
          published_at, processed
        ) VALUES (
          item_description, original_url, v_url_hash,
          item_title, COALESCE(NULLIF(item_source_name, ''), feed_rec.name),
          COALESCE(item_date, now()), false
        )
        ON CONFLICT (url_hash) DO NOTHING;

        -- Stage 1: Relevance filter (with URL + title context)
        groq_body := jsonb_build_object(
          'model', 'qwen/qwen3.8-27b',
          'messages', jsonb_build_array(
            jsonb_build_object('role', 'system', 'content',
              'You filter news for a local events and incidents dashboard in Adamantina, Lucélia, Osvaldo Cruz, Pacaembu, Dracena, Flórida Paulista, and Parapuã, SP. Return JSON {"relevant": boolean}. RELEVANT only if the news is about one of THESE cities. RELEVANT: local incidents (traffic and motorcycle accidents, fires, blackouts, floods, potholes, violence, crime, police operations, drug seizures, arrests, road closures) and local announcements (store inaugurations/reinaugurations, shows, cinema session programs, festivals, fairs, parades, community events) in these cities - e.g. a cinema session announcement, a show announcement, or a store reinauguration IS relevant. NOT relevant: news from other cities or states (even similar incidents), politics, elections, sports results, celebrity gossip, financial news, generic sponsored content.'
            ),
            jsonb_build_object('role', 'user', 'content',
              'Is this a relevant local news for Adamantina, Lucélia, Osvaldo Cruz, Pacaembu, Dracena, Flórida Paulista or Parapuã, SP? URL: ' || left(original_url, 200) || ' Title: ' || coalesce(left(item_title, 300), '') || coalesce(' Summary: ' || left(item_description, 300), '')
            )
          ),
          'max_tokens', 250,
          'temperature', 0.1,
          'response_format', jsonb_build_object('type', 'json_object')
        )::text;

        stat_groq := stat_groq + 1;
        groq_response := public.http_post_json(
          'https://api.groq.com/openai/v1/chat/completions', groq_body, groq_api_key, browser_ua
        );

        PERFORM pg_sleep(2);

        BEGIN
          IF groq_response IS NULL OR groq_response = '' THEN
            stat_errors := array_append(stat_errors, 'Groq empty: ' || left(original_url, 100));
            CONTINUE;
          END IF;
          -- API error (e.g. 429): fallback to gpt-oss-20b; on failure leave
          -- processed=false so the article is retried on the next run
          IF NOT (groq_response::jsonb ? 'choices') THEN
            stat_errors := array_append(stat_errors, 'Groq error S1: ' || left(groq_response, 120) || ' | ' || left(original_url, 80));
            PERFORM pg_sleep(3);
            groq_response := public.http_post_json(
              'https://api.groq.com/openai/v1/chat/completions',
              (groq_body::jsonb || jsonb_build_object('model', 'openai/gpt-oss-20b', 'max_tokens', 600))::text,
              groq_api_key, browser_ua
            );
            PERFORM pg_sleep(2);
            IF groq_response IS NULL OR groq_response = '' OR NOT (groq_response::jsonb ? 'choices') THEN
              IF coalesce(groq_response, '') LIKE '%tokens per day%' THEN
                stat_errors := array_append(stat_errors, 'Daily token limit reached on both models - stopping run');
                v_budget_done := true;
              END IF;
              CONTINUE;
            END IF;
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
          -- Mark as evaluated so it is not re-filtered every run
          UPDATE public.raw_reports SET processed = true WHERE url_hash = v_url_hash;
          CONTINUE;
        END IF;
        EXCEPTION WHEN OTHERS THEN
          stat_errors := array_append(stat_errors, 'Parse filter: ' || sqlerrm || ' | resp: ' || left(coalesce(groq_response, 'NULL'), 300));
          CONTINUE;
        END;

        IF NOT COALESCE(relevant, false) THEN
          CONTINUE;
        END IF;

        RAISE NOTICE 'S1[%] REL: %', stat_groq, left(item_title, 70);
        stat_relevant := stat_relevant + 1;

        -- Resolve Google News redirect and fetch the article body so Stage 2
        -- can extract the real address (street/number/neighborhood)
        v_real_url := original_url;
        v_article_text := '';
        BEGIN
          IF original_url LIKE 'https://news.google.com/rss/articles/%' THEN
            v_resolved_url := public.resolve_google_news_url(original_url, browser_ua);
            IF v_resolved_url IS NOT NULL THEN
              v_real_url := v_resolved_url;
              PERFORM pg_sleep(1);
            END IF;
          END IF;
          IF v_real_url NOT LIKE '%news.google.com%' THEN
            v_article_text := public.fetch_article_text(v_real_url, browser_ua);
            IF v_article_text <> '' THEN
              RAISE NOTICE 'CONTENT: % chars from %',
                length(v_article_text),
                left(substring(v_real_url from 'https?://(?:www\.)?([^/]+)'), 40);
              PERFORM pg_sleep(1);
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_real_url := original_url;
          v_article_text := '';
        END;
        original_url := v_real_url;

        -- Region guard: the article must actually mention one of the monitored
        -- cities (title + summary + body). Blocks ES/MG/GO/etc. articles that
        -- slip past Stage 1 from being forced into 'Adamantina'.
        v_search_text := lower(
          coalesce(item_title, '') || ' ' || coalesce(item_description, '') || ' ' || coalesce(v_article_text, '')
        );
        v_mentioned_city := CASE
          WHEN v_search_text ~ 'adamantina' THEN 'Adamantina'
          WHEN v_search_text ~ 'luc[ée]lia' THEN 'Lucélia'
          WHEN v_search_text ~ '(osvaldo|oswaldo)[ -]cruz' THEN 'Osvaldo Cruz'
          WHEN v_search_text ~ 'pacaembu' THEN 'Pacaembu'
          WHEN v_search_text ~ 'dracena' THEN 'Dracena'
          WHEN v_search_text ~ 'fl[óo]rida[ -]paulista' THEN 'Flórida Paulista'
          WHEN v_search_text ~ 'parapu[ãa]' THEN 'Parapuã'
          WHEN v_search_text ~ 'fl[óo]rida' THEN 'Flórida Paulista'
          ELSE NULL
        END;
        IF v_mentioned_city IS NULL THEN
          stat_region_rejected := stat_region_rejected + 1;
          stat_errors := array_append(stat_errors, 'RegionFiltered: ' || left(item_title, 70));
          RAISE NOTICE 'REGION REJECT: %', left(item_title, 70);
          UPDATE public.raw_reports SET processed = true WHERE url_hash = v_url_hash;
          CONTINUE;
        END IF;

        -- Stage 2: Full analysis
        groq_body := jsonb_build_object(
          'model', 'qwen/qwen3.8-27b',
          'messages', jsonb_build_array(
            jsonb_build_object('role', 'system', 'content',
              'Você é um analista de OSINT. Extraia informações de uma notícia brasileira sobre incidentes/eventos urbanos. Responda SOMENTE JSON: {"title":"","description":"","type":"","severity":"","confidence":0.5,"city":"","state":"","street":"","number":"","cross_street":"","neighborhood":""}. type (escolha o mais específico): motorcycle_accident = acidente com moto; traffic_accident = outros acidentes de trânsito; power_outage = queda de energia/blackout; fire = incêndio; flood = alagamento/enchente; weather = clima/temporal sem alagamento; pothole = buraco na via; infrastructure_damage = poste/árvore caída, fiação danificada; road_closure = interdição/fechamento de via; violence = crime, prisão, drogas, apreensão; show = show ou cinema; party = festa/festival; noise = barulho; inauguration = inauguração/reinauguração de comércio; other = outro. severity: low/medium/high/critical. Campos em português. ENDEREÇO (muito importante): street = logradouro com tipo (ex: "Rua Tiradentes", "Avenida Rio Branco"); number = número do imóvel se houver; cross_street = rua de cruzamento ("Rua X com Rua Y" -> street=X, cross_street=Y); neighborhood = bairro; city = cidade (APENAS se citada literalmente no texto); state = "SP". Preencha TODOS os dados de localização presentes no texto. Não invente: deixe vazio se não houver.'
            ),
            jsonb_build_object('role', 'user', 'content',
              'URL: ' || left(original_url, 200) ||
              ' | Título: ' || coalesce(left(item_title, 300), '') ||
              CASE WHEN v_article_text <> '' THEN
                E'\n\nTEXTO COMPLETO DA NOTÍCIA:\n' || left(v_article_text, 4500)
              ELSE
                coalesce(E'\n\nResumo: ' || left(item_description, 500), '')
              END
            )
          ),
          'max_tokens', 700,
          'temperature', 0.2,
          'response_format', jsonb_build_object('type', 'json_object')
        )::text;

        groq_response := public.http_post_json(
          'https://api.groq.com/openai/v1/chat/completions', groq_body, groq_api_key, browser_ua
        );

        PERFORM pg_sleep(2);

        BEGIN
          IF groq_response IS NULL OR groq_response = '' THEN
            stat_errors := array_append(stat_errors, 'Groq empty Stage2: ' || left(original_url, 100));
            CONTINUE;
          END IF;
          -- API error (e.g. 429): fallback to gpt-oss-20b; on failure skip without
          -- creating a junk incident (raw_report stays unlinked, retried next run)
          IF NOT (groq_response::jsonb ? 'choices') THEN
            stat_errors := array_append(stat_errors, 'Groq error S2: ' || left(groq_response, 120) || ' | ' || left(original_url, 80));
            PERFORM pg_sleep(3);
            groq_response := public.http_post_json(
              'https://api.groq.com/openai/v1/chat/completions',
              (groq_body::jsonb || jsonb_build_object('model', 'openai/gpt-oss-20b', 'max_tokens', 1200))::text,
              groq_api_key, browser_ua
            );
            PERFORM pg_sleep(2);
            IF groq_response IS NULL OR groq_response = '' OR NOT (groq_response::jsonb ? 'choices') THEN
              IF coalesce(groq_response, '') LIKE '%tokens per day%' THEN
                stat_errors := array_append(stat_errors, 'Daily token limit reached on both models - stopping run');
                v_budget_done := true;
              END IF;
              CONTINUE;
            END IF;
          END IF;
          groq_json := ((groq_response::jsonb)->'choices'->0->'message'->>'content')::jsonb;
          ai_title := groq_json->>'title';
          ai_description := groq_json->>'description';
          ai_type := groq_json->>'type';
          ai_severity := groq_json->>'severity';
          ai_city := groq_json->>'city';
          ai_state := groq_json->>'state';
          ai_street := groq_json->>'street';
          ai_neighborhood := groq_json->>'neighborhood';
          ai_number := groq_json->>'number';
          ai_cross_street := groq_json->>'cross_street';
          ai_confidence := COALESCE((groq_json->>'confidence')::numeric, 0.5);
        EXCEPTION WHEN OTHERS THEN
          stat_errors := array_append(stat_errors, 'Parse Stage2: ' || sqlerrm || ' | resp: ' || left(coalesce(groq_response, 'NULL'), 300) || ' | url: ' || left(original_url, 100));
          CONTINUE;
        END;

        -- Defaults
        ai_title := COALESCE(NULLIF(ai_title, ''), 'Incidente detectado via crawler');
        ai_description := COALESCE(NULLIF(ai_description, ''), original_url);
        ai_type := COALESCE(NULLIF(ai_type, ''), 'other');
        ai_severity := COALESCE(NULLIF(ai_severity, ''), 'medium');
        -- City/state: all monitored cities are in SP. If the model returned an
        -- out-of-region city (or none), use the city detected by the region
        -- guard; never force out-of-region articles into 'Adamantina'.
        IF COALESCE(ai_city, '') NOT IN ('Adamantina', 'Lucélia', 'Osvaldo Cruz', 'Pacaembu', 'Dracena', 'Flórida Paulista', 'Parapuã') THEN
          ai_city := v_mentioned_city;
        END IF;
        ai_state := 'SP';

        -- Build display address: "Rua X, 123 com Rua Y - Bairro"
        v_new_address := trim(
          COALESCE(NULLIF(ai_street, '') ||
            CASE WHEN COALESCE(ai_number, '') <> '' THEN ', ' || ai_number ELSE '' END ||
            CASE WHEN COALESCE(ai_cross_street, '') <> '' THEN ' com ' || ai_cross_street ELSE '' END, '') ||
          CASE WHEN COALESCE(ai_neighborhood, '') <> '' THEN
            CASE WHEN COALESCE(NULLIF(ai_street, ''), '') <> '' THEN ' - ' ELSE '' END || ai_neighborhood
          ELSE '' END
        );

        -- Normalize type to the frontend taxonomy (allowlist first, then fuzzy)
        ai_type := lower(coalesce(ai_type, ''));
        IF ai_type IN ('motorcycle_accident', 'traffic_accident', 'power_outage', 'fire',
                       'flood', 'weather', 'pothole', 'infrastructure_damage', 'road_closure',
                       'violence', 'show', 'party', 'noise', 'inauguration', 'other') THEN
          NULL;
        ELSIF ai_type LIKE '%moto%' THEN
          ai_type := 'motorcycle_accident';
        ELSIF ai_type LIKE '%accid%' OR ai_type LIKE '%crash%' OR ai_type LIKE '%colis%'
           OR ai_type LIKE '%batida%' OR ai_type LIKE '%atropel%' THEN
          ai_type := 'traffic_accident';
        ELSIF ai_type LIKE '%fire%' OR ai_type LIKE '%incendi%' OR ai_type LIKE '%fogo%' THEN
          ai_type := 'fire';
        ELSIF ai_type LIKE '%power%' OR ai_type LIKE '%energi%' OR ai_type LIKE '%blackout%'
           OR ai_type LIKE '%desligamento%' OR ai_type LIKE '%queda de luz%' THEN
          ai_type := 'power_outage';
        ELSIF ai_type LIKE '%enchent%' OR ai_type LIKE '%alaga%' OR ai_type LIKE '%aluvi%'
           OR ai_type LIKE '%inunda%' OR ai_type LIKE '%flood%' THEN
          ai_type := 'flood';
        ELSIF ai_type LIKE '%chuva%' OR ai_type LIKE '%temporal%' OR ai_type LIKE '%clima%'
           OR ai_type LIKE '%weather%' OR ai_type LIKE '%vento%' OR ai_type LIKE '%seca%' THEN
          ai_type := 'weather';
        ELSIF ai_type LIKE '%pothole%' OR ai_type LIKE '%buraco%' THEN
          ai_type := 'pothole';
        ELSIF ai_type LIKE '%road damage%' OR ai_type LIKE '%infra%'
           OR ai_type LIKE '%poste%' OR ai_type LIKE '%fia%'
           OR ai_type LIKE '%rvore%' THEN
          ai_type := 'infrastructure_damage';
        ELSIF ai_type LIKE '%violence%' OR ai_type LIKE '%violência%' OR ai_type LIKE '%crime%'
           OR ai_type LIKE '%pris%' OR ai_type LIKE '%apreen%' OR ai_type LIKE '%droga%'
           OR ai_type LIKE '%trafico%' OR ai_type LIKE '%roubo%' OR ai_type LIKE '%furto%'
           OR ai_type LIKE '%arrest%' OR ai_type LIKE '%policia%' OR ai_type LIKE '%police%'
           OR ai_type LIKE '%sequestro%' OR ai_type LIKE '%amea%' THEN
          ai_type := 'violence';
        ELSIF ai_type LIKE '%closure%' OR ai_type LIKE '%interdi%' OR ai_type LIKE '%bloqueio%'
           OR ai_type LIKE '%fechamento%' THEN
          ai_type := 'road_closure';
        ELSIF ai_type LIKE '%inaug%' THEN
          ai_type := 'inauguration';
        ELSIF ai_type LIKE '%festa%' OR ai_type LIKE '%festival%' THEN
          ai_type := 'party';
        ELSIF ai_type LIKE '%cinema%' OR ai_type LIKE '%show%' THEN
          ai_type := 'show';
        ELSIF ai_type LIKE '%noise%' OR ai_type LIKE '%barulho%' THEN
          ai_type := 'noise';
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
        ELSIF ai_severity LIKE '%low%' OR ai_severity LIKE '%baix%' THEN
          ai_severity := 'low';
        ELSE
          ai_severity := 'medium';
        END IF;

        -- Geocoding: Nominatim (full address) -> Photon -> per-city center.
        -- Reset per article so coords never bleed from the previous item.
        lat := 0;
        lng := 0;
        SELECT g.o_lat, g.o_lng INTO lat, lng
          FROM public.geocode_address(ai_street, ai_number, ai_neighborhood, ai_city, browser_ua) g;

        -- Determine display source name: use <source> tag if available, else feed name or URL domain
        v_display_source := COALESCE(
          NULLIF(item_source_name, ''),
          feed_rec.name
        );

        -- Determine display source URL: use <source> url if available, else extract from article URL
        v_display_source_url := COALESCE(
          NULLIF(item_source_url, ''),
          substring(original_url from 'https?://(?:www\.)?([^/]+)')
        );

        -- Create incident (source = "SourceName | ArticleURL")
        v_source_display := v_display_source || ' | ' || original_url;

        -- Merge candidates: same type, active, within 200m, created in last 24h.
        -- Iterate up to 3 candidates — same-run incidents share created_at (now()).
        v_merge_id := NULL;
        FOR v_cand_id IN
          SELECT id
          FROM public.incidents
          WHERE type = ai_type
            AND status = 'active'
            AND created_at > now() - interval '24 hours'
            AND latitude IS NOT NULL AND longitude IS NOT NULL
            AND 6371000 * acos(least(1.0,
                  cos(radians(latitude)) * cos(radians(lat))
                  * cos(radians(lng) - radians(longitude))
                  + sin(radians(latitude)) * sin(radians(lat))
                )) <= 200
          ORDER BY created_at DESC, id DESC
          LIMIT 3
        LOOP
          -- AI confirmation: is it really the same event?
          SELECT title, COALESCE(description, '') INTO existing_title, existing_desc
          FROM public.incidents WHERE id = v_cand_id;

          v_same_body := jsonb_build_object(
            'model', 'qwen/qwen3.8-27b',
            'messages', jsonb_build_array(
              jsonb_build_object('role', 'system', 'content',
                'Você compara duas notícias sobre possivelmente o mesmo incidente urbano. Responda SOMENTE JSON: {"same": true|false}. Responda true APENAS se forem sobre o mesmo acontecimento (mesmo local, mesma situação, mesmo evento), mesmo que títulos ou fontes difiram. Responda false se forem acontecimentos distintos, ainda que parecidos.'),
              jsonb_build_object('role', 'user', 'content',
                'NOTÍCIA A (já registrada): ' || left(existing_title, 300) || ' | ' || left(existing_desc, 400) ||
                ' || NOTÍCIA B (nova): ' || left(ai_title, 300) || ' | ' || left(ai_description, 400))
            ),
            'temperature', 0.1,
            'max_tokens', 50,
            'response_format', jsonb_build_object('type', 'json_object')
          )::text;

          v_same_response := public.http_post_json(
            'https://api.groq.com/openai/v1/chat/completions', v_same_body, groq_api_key, browser_ua
          );
          PERFORM pg_sleep(2);

          BEGIN
            -- API error (e.g. 429): fallback to gpt-oss-20b, otherwise treat as not-same
            IF v_same_response IS NULL OR v_same_response = ''
               OR NOT (v_same_response::jsonb ? 'choices') THEN
              PERFORM pg_sleep(3);
              v_same_response := public.http_post_json(
                'https://api.groq.com/openai/v1/chat/completions',
                (v_same_body::jsonb || jsonb_build_object('model', 'openai/gpt-oss-20b', 'max_tokens', 400))::text,
                groq_api_key, browser_ua
              );
              PERFORM pg_sleep(2);
            END IF;
            v_merge_same := COALESCE(
              (((v_same_response::jsonb)->'choices'->0->'message'->>'content')::jsonb->>'same')::boolean,
              false
            );
          EXCEPTION WHEN OTHERS THEN
            v_merge_same := false;
          END;

          IF v_merge_same THEN
            v_merge_id := v_cand_id;
            EXIT;
          END IF;
        END LOOP;

        IF v_merge_id IS NOT NULL THEN
          -- MERGE: reuse existing incident — new source becomes another NewsCard
          v_incident_id := v_merge_id;

          INSERT INTO public.incident_reports (incident_id, user_id, type, comment)
          VALUES (v_merge_id, NULL, 'confirm', 'Notícia relacionada via crawler: ' || v_display_source);

          stat_merged := stat_merged + 1;

          -- Fill location gaps of the existing incident with the new data
          IF COALESCE(v_new_address, '') <> '' THEN
            UPDATE public.incidents SET
              address = v_new_address,
              latitude = CASE WHEN COALESCE(address, '') = '' THEN lat ELSE latitude END,
              longitude = CASE WHEN COALESCE(address, '') = '' THEN lng ELSE longitude END
            WHERE id = v_merge_id
              AND COALESCE(address, '') = '';
          END IF;

        ELSIF NOT EXISTS(SELECT 1 FROM public.incidents WHERE source = v_source_display) THEN
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
            COALESCE(v_new_address, ''), ai_city, ai_state,
             ai_confidence,
             v_source_display,
             v_source_id,
             now()
          )
          RETURNING id INTO v_incident_id;

          stat_created := stat_created + 1;
        ELSE
          SELECT id INTO v_incident_id FROM public.incidents WHERE source = v_source_display LIMIT 1;
        END IF;

        RAISE NOTICE '%: % [%]',
          CASE WHEN v_merge_id IS NOT NULL THEN 'MERGE' ELSE 'CREATE' END,
          left(ai_title, 65), ai_type;

        -- Link raw_report to incident (makes incident_news view / NewsCard work)
        UPDATE public.raw_reports SET
          incident_id = v_incident_id,
          processed = true,
          title = ai_title,
          description = ai_description,
          source_name = v_display_source,
          original_url = CASE
            WHEN EXISTS(
              SELECT 1 FROM public.raw_reports r2
              WHERE r2.original_url = v_real_url AND r2.url_hash <> v_url_hash
            ) THEN public.raw_reports.original_url
            ELSE v_real_url
          END,
          original_text = CASE WHEN v_article_text <> ''
            THEN left(v_article_text, 2000)
            ELSE left(item_description, 2000) END
        WHERE url_hash = v_url_hash;

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
    'merged', stat_merged,
    'region_rejected', stat_region_rejected,
    'errors', stat_errors
  );
END;
$func$;

COMMENT ON FUNCTION public.run_sql_crawler() IS 'Crawler v2.6: RSS+GoogleNews feeds, Google News URL resolution, article body fetch, region mention guard (7 monitored cities), address extraction, Nominatim/Photon geocoding. Key via crawler_config table.';

-- ---------------------------------------------------------------------------
-- Backfill: re-analyze existing incidents that have no address (or wrong
-- hardcoded center coords) by resolving the article URL, fetching the full
-- text and re-extracting the location. Updates the incident in place.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_incident_locations(p_limit int DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql AS $func$
DECLARE
  groq_api_key text;
  browser_ua text := 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  rec record;
  v_real_url text;
  v_resolved_url text;
  v_article_text text;
  groq_body text;
  groq_response text;
  groq_json jsonb;
  ai_title text;
  ai_description text;
  ai_type text;
  ai_severity text;
  ai_city text;
  ai_state text;
  ai_street text;
  ai_neighborhood text;
  ai_number text;
  ai_cross_street text;
  ai_confidence numeric;
  v_new_address text;
  v_search_text text;
  v_mentioned_city text;
  lat numeric;
  lng numeric;
  stat_candidates int := 0;
  stat_updated int := 0;
  stat_no_content int := 0;
  stat_no_address int := 0;
  stat_errors text[] := '{}';
BEGIN
  groq_api_key := public.get_crawler_key('groq_api_key');
  IF groq_api_key IS NULL THEN
    RETURN jsonb_build_object('error', 'Groq API key not configured');
  END IF;

  FOR rec IN
    SELECT t.* FROM (
      SELECT DISTINCT ON (i.id)
        i.id AS incident_id,
        i.title AS incident_title,
        i.created_at,
        i.updated_at,
        i.city AS incident_city,
        COALESCE(i.address, '') AS had_address,
        rr.original_url,
        COALESCE(NULLIF(rr.title, ''), i.title) AS article_title
      FROM public.incidents i
      JOIN public.raw_reports rr ON rr.incident_id = i.id
      WHERE (COALESCE(i.address, '') = ''
             OR (i.address <> '' AND i.latitude = -21.6866517 AND i.longitude = -51.0762975))
        AND i.title <> 'Incidente detectado via crawler'
      ORDER BY i.id, rr.created_at DESC
    ) t
    ORDER BY (t.had_address = '') DESC, t.updated_at ASC
    LIMIT p_limit
  LOOP
    UPDATE public.incidents SET updated_at = now() WHERE id = rec.incident_id;
    stat_candidates := stat_candidates + 1;

    -- Resolve Google News redirect
    v_real_url := rec.original_url;
    v_article_text := '';
    BEGIN
      IF rec.original_url LIKE 'https://news.google.com/rss/articles/%' THEN
        v_resolved_url := public.resolve_google_news_url(rec.original_url, browser_ua);
        IF v_resolved_url IS NOT NULL THEN
          v_real_url := v_resolved_url;
          PERFORM pg_sleep(1);
        END IF;
      END IF;
      IF v_real_url NOT LIKE '%news.google.com%' THEN
        v_article_text := public.fetch_article_text(v_real_url, browser_ua);
        IF v_article_text <> '' THEN
          PERFORM pg_sleep(1);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_article_text := '';
    END;

    IF v_article_text = '' THEN
      stat_no_content := stat_no_content + 1;
      RAISE NOTICE 'SKIP no_content: %', left(rec.incident_title, 60);
      CONTINUE;
    END IF;

    -- Region guard: fetched text must mention a monitored city (otherwise the
    -- URL resolved to an unrelated article and the extraction would be junk)
    v_search_text := lower(coalesce(rec.article_title, '') || ' ' || coalesce(v_article_text, ''));
    v_mentioned_city := CASE
      WHEN v_search_text ~ 'adamantina' THEN 'Adamantina'
      WHEN v_search_text ~ 'luc[ée]lia' THEN 'Lucélia'
      WHEN v_search_text ~ '(osvaldo|oswaldo)[ -]cruz' THEN 'Osvaldo Cruz'
      WHEN v_search_text ~ 'pacaembu' THEN 'Pacaembu'
      WHEN v_search_text ~ 'dracena' THEN 'Dracena'
      WHEN v_search_text ~ 'fl[óo]rida[ -]paulista' THEN 'Flórida Paulista'
      WHEN v_search_text ~ 'parapu[ãa]' THEN 'Parapuã'
      WHEN v_search_text ~ 'fl[óo]rida' THEN 'Flórida Paulista'
      ELSE NULL
    END;
    IF v_mentioned_city IS NULL THEN
      stat_no_address := stat_no_address + 1;
      RAISE NOTICE 'SKIP region: %', left(rec.incident_title, 60);
      CONTINUE;
    END IF;

    -- Stage 2 style extraction with full text
    groq_body := jsonb_build_object(
      'model', 'qwen/qwen3.8-27b',
      'messages', jsonb_build_array(
        jsonb_build_object('role', 'system', 'content',
          'Você é um analista de OSINT. Extraia informações de uma notícia brasileira sobre incidentes/eventos urbanos. Responda SOMENTE JSON: {"title":"","description":"","type":"","severity":"","confidence":0.5,"city":"","state":"","street":"","number":"","cross_street":"","neighborhood":""}. type (escolha o mais específico): motorcycle_accident = acidente com moto; traffic_accident = outros acidentes de trânsito; power_outage = queda de energia/blackout; fire = incêndio; flood = alagamento/enchente; weather = clima/temporal sem alagamento; pothole = buraco na via; infrastructure_damage = poste/árvore caída, fiação danificada; road_closure = interdição/fechamento de via; violence = crime, prisão, drogas, apreensão; show = show ou cinema; party = festa/festival; noise = barulho; inauguration = inauguração/reinauguração de comércio; other = outro. severity: low/medium/high/critical. Campos em português. ENDEREÇO (muito importante): street = logradouro com tipo (ex: "Rua Tiradentes", "Avenida Rio Branco"); number = número do imóvel se houver; cross_street = rua de cruzamento ("Rua X com Rua Y" -> street=X, cross_street=Y); neighborhood = bairro; city = cidade (APENAS se citada literalmente no texto); state = "SP". Preencha TODOS os dados de localização presentes no texto. Não invente: deixe vazio se não houver.'
        ),
        jsonb_build_object('role', 'user', 'content',
          'URL: ' || left(v_real_url, 200) ||
          ' | Título: ' || left(coalesce(rec.article_title, ''), 300) ||
          E'\n\nTEXTO COMPLETO DA NOTÍCIA:\n' || left(v_article_text, 4500)
        )
      ),
      'max_tokens', 700,
      'temperature', 0.2,
      'response_format', jsonb_build_object('type', 'json_object')
    )::text;

    groq_response := public.http_post_json(
      'https://api.groq.com/openai/v1/chat/completions', groq_body, groq_api_key, browser_ua
    );
    PERFORM pg_sleep(2);

    BEGIN
      IF groq_response IS NULL OR groq_response = '' THEN
        stat_errors := array_append(stat_errors, 'Groq empty: ' || left(v_real_url, 80));
        CONTINUE;
      END IF;
      IF NOT (groq_response::jsonb ? 'choices') THEN
        PERFORM pg_sleep(3);
        groq_response := public.http_post_json(
          'https://api.groq.com/openai/v1/chat/completions',
          (groq_body::jsonb || jsonb_build_object('model', 'openai/gpt-oss-20b', 'max_tokens', 1200))::text,
          groq_api_key, browser_ua
        );
        PERFORM pg_sleep(2);
        IF groq_response IS NULL OR groq_response = '' OR NOT (groq_response::jsonb ? 'choices') THEN
          IF coalesce(groq_response, '') LIKE '%tokens per day%' THEN
            stat_errors := array_append(stat_errors, 'Daily token limit reached - stopping backfill');
            EXIT;
          END IF;
          CONTINUE;
        END IF;
      END IF;
      groq_json := ((groq_response::jsonb)->'choices'->0->'message'->>'content')::jsonb;
      ai_street := groq_json->>'street';
      ai_neighborhood := groq_json->>'neighborhood';
      ai_number := groq_json->>'number';
      ai_cross_street := groq_json->>'cross_street';
      ai_city := groq_json->>'city';
      ai_state := groq_json->>'state';
    EXCEPTION WHEN OTHERS THEN
      stat_errors := array_append(stat_errors, 'Parse: ' || sqlerrm || ' | ' || left(coalesce(groq_response, ''), 200));
      CONTINUE;
    END;

    -- City must be in the monitored region (fall back to the region guard's mention)
    IF COALESCE(ai_city, '') NOT IN ('Adamantina', 'Lucélia', 'Osvaldo Cruz', 'Pacaembu', 'Dracena', 'Flórida Paulista', 'Parapuã') THEN
      ai_city := v_mentioned_city;
    END IF;
    IF COALESCE(ai_street, '') = '' AND COALESCE(ai_neighborhood, '') = '' THEN
      stat_no_address := stat_no_address + 1;
      RAISE NOTICE 'SKIP no_address: %', left(rec.incident_title, 60);
      CONTINUE;
    END IF;

    v_new_address := trim(
      COALESCE(NULLIF(ai_street, '') ||
        CASE WHEN COALESCE(ai_number, '') <> '' THEN ', ' || ai_number ELSE '' END ||
        CASE WHEN COALESCE(ai_cross_street, '') <> '' THEN ' com ' || ai_cross_street ELSE '' END, '') ||
      CASE WHEN COALESCE(ai_neighborhood, '') <> '' THEN
        CASE WHEN COALESCE(NULLIF(ai_street, ''), '') <> '' THEN ' - ' ELSE '' END || ai_neighborhood
      ELSE '' END
    );
    IF v_new_address = '' THEN
      stat_no_address := stat_no_address + 1;
      CONTINUE;
    END IF;

    SELECT g.o_lat, g.o_lng INTO lat, lng
      FROM public.geocode_address(ai_street, ai_number, ai_neighborhood,
        COALESCE(ai_city, rec.incident_city, 'Adamantina'), browser_ua) g;

    UPDATE public.incidents SET
      address = v_new_address,
      latitude = lat,
      longitude = lng,
      city = COALESCE(ai_city, city)
    WHERE id = rec.incident_id;

    stat_updated := stat_updated + 1;
    RAISE NOTICE 'BACKFILL: % -> "%"', left(rec.incident_title, 50), v_new_address;
  END LOOP;

  RETURN jsonb_build_object(
    'candidates', stat_candidates,
    'updated', stat_updated,
    'no_content', stat_no_content,
    'no_address', stat_no_address,
    'errors', stat_errors
  );
END;
$func$;

COMMENT ON FUNCTION public.backfill_incident_locations(int) IS 'Re-analyzes incidents without address: resolve URL, fetch article text, extract location, geocode, update in place.';
