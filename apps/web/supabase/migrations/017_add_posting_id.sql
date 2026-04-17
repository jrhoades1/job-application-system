-- 016_add_posting_id.sql
-- Add a stable `posting_id` derived from the posting URL so duplicates caused by
-- per-user/per-digest URL variance or role-title re-extraction can be detected.
-- Covers LinkedIn, Greenhouse, Ashby, Lever, Workday, Built In.

-- Shared extraction function. IMMUTABLE so it can be used in generated columns
-- or expression indexes if ever needed, and called from triggers.
CREATE OR REPLACE FUNCTION public.extract_posting_id(url text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  m text[];
BEGIN
  IF url IS NULL OR length(url) = 0 THEN
    RETURN NULL;
  END IF;

  -- LinkedIn: /jobs/view/<id>/ (accepts /comm/ prefix) or ?currentJobId=<id>
  IF url ~ 'linkedin\.com' THEN
    m := regexp_match(url, 'linkedin\.com[^\s]*/(?:comm/)?jobs/view/(\d+)');
    IF m IS NOT NULL THEN
      RETURN 'linkedin:' || m[1];
    END IF;
    m := regexp_match(url, '[?&]currentJobId=(\d+)');
    IF m IS NOT NULL THEN
      RETURN 'linkedin:' || m[1];
    END IF;
    RETURN NULL;
  END IF;

  -- Greenhouse: boards.greenhouse.io/<board>/jobs/<id> or job-boards.greenhouse.io/<board>/jobs/<id>
  IF url ~ 'greenhouse\.io' THEN
    m := regexp_match(url, 'greenhouse\.io/([^/?#]+)/jobs/(\d+)');
    IF m IS NOT NULL THEN
      RETURN 'greenhouse:' || m[1] || ':' || m[2];
    END IF;
    RETURN NULL;
  END IF;

  -- Ashby: jobs.ashbyhq.com/<org>/<uuid>
  IF url ~ 'ashbyhq\.com' THEN
    m := regexp_match(url, 'ashbyhq\.com/([^/?#]+)/([a-f0-9][a-f0-9-]{7,})');
    IF m IS NOT NULL THEN
      RETURN 'ashby:' || m[1] || ':' || m[2];
    END IF;
    RETURN NULL;
  END IF;

  -- Lever: jobs.lever.co/<org>/<uuid>
  IF url ~ 'lever\.co' THEN
    m := regexp_match(url, 'lever\.co/([^/?#]+)/([a-f0-9][a-f0-9-]{7,})');
    IF m IS NOT NULL THEN
      RETURN 'lever:' || m[1] || ':' || m[2];
    END IF;
    RETURN NULL;
  END IF;

  -- Workday: <sub>.myworkdayjobs.com/<site>/job/<loc>/<slug>_<reqid>
  IF url ~ 'myworkdayjobs\.com' THEN
    m := regexp_match(url, 'myworkdayjobs\.com/[^/]+(?:/[^/]+)?/job/[^/]+/([^/?#]+)');
    IF m IS NOT NULL THEN
      RETURN 'workday:' || m[1];
    END IF;
    RETURN NULL;
  END IF;

  -- Built In: builtin.com/job/<slug>/<id>
  IF url ~ 'builtin\.com/job/' THEN
    m := regexp_match(url, 'builtin\.com/job/[^/]*/(\d+)');
    IF m IS NOT NULL THEN
      RETURN 'builtin:' || m[1];
    END IF;
    RETURN NULL;
  END IF;

  RETURN NULL;
END;
$$;

-- Columns
ALTER TABLE public.pipeline_leads ADD COLUMN IF NOT EXISTS posting_id text;
ALTER TABLE public.applications   ADD COLUMN IF NOT EXISTS posting_id text;

-- Backfill from existing URL columns
UPDATE public.pipeline_leads
   SET posting_id = public.extract_posting_id(career_page_url)
 WHERE posting_id IS NULL
   AND career_page_url IS NOT NULL;

UPDATE public.applications
   SET posting_id = public.extract_posting_id(source_url)
 WHERE posting_id IS NULL
   AND source_url IS NOT NULL;

-- Trigger to auto-populate on insert/update whenever the URL changes.
-- Respects an explicit posting_id if the caller provides one.
CREATE OR REPLACE FUNCTION public.set_pipeline_leads_posting_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.posting_id IS NULL AND NEW.career_page_url IS NOT NULL THEN
    NEW.posting_id := public.extract_posting_id(NEW.career_page_url);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_applications_posting_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.posting_id IS NULL AND NEW.source_url IS NOT NULL THEN
    NEW.posting_id := public.extract_posting_id(NEW.source_url);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pipeline_leads_posting_id ON public.pipeline_leads;
CREATE TRIGGER pipeline_leads_posting_id
BEFORE INSERT OR UPDATE OF career_page_url, posting_id ON public.pipeline_leads
FOR EACH ROW EXECUTE FUNCTION public.set_pipeline_leads_posting_id();

DROP TRIGGER IF EXISTS applications_posting_id ON public.applications;
CREATE TRIGGER applications_posting_id
BEFORE INSERT OR UPDATE OF source_url, posting_id ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.set_applications_posting_id();

-- Non-unique index for lookup speed. The unique partial index lands in 018
-- after the dup merge in 017 runs.
CREATE INDEX IF NOT EXISTS pipeline_leads_posting_id_idx
  ON public.pipeline_leads (clerk_user_id, posting_id)
  WHERE posting_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS applications_posting_id_idx
  ON public.applications (clerk_user_id, posting_id)
  WHERE posting_id IS NOT NULL;
