-- 017_merge_posting_dups.sql
-- Collapse existing duplicate rows that share a (clerk_user_id, posting_id)
-- pair by keeping the highest-priority row and soft-deleting the rest.
--
-- Priority (higher wins):
--   applications: offer(100) > interviewing(90) > applied(80) > rejected(70)
--                 > evaluating(60) > withdrawn(50) > other(40)
--   pipeline_leads (promoted → priority of linked application; otherwise):
--     promoted(45) > pending_review(40) > skipped(20) > auto_skipped(10)
-- Ties broken by most recent email_date/applied_date, then created_at.

-- --- applications --------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    clerk_user_id,
    posting_id,
    CASE status
      WHEN 'offer'        THEN 100
      WHEN 'interviewing' THEN  90
      WHEN 'applied'      THEN  80
      WHEN 'rejected'     THEN  70
      WHEN 'evaluating'   THEN  60
      WHEN 'withdrawn'    THEN  50
      ELSE                       40
    END AS priority,
    applied_date,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY clerk_user_id, posting_id
      ORDER BY
        CASE status
          WHEN 'offer'        THEN 100
          WHEN 'interviewing' THEN  90
          WHEN 'applied'      THEN  80
          WHEN 'rejected'     THEN  70
          WHEN 'evaluating'   THEN  60
          WHEN 'withdrawn'    THEN  50
          ELSE                       40
        END DESC,
        applied_date DESC NULLS LAST,
        created_at DESC
    ) AS rn
  FROM public.applications
  WHERE deleted_at IS NULL
    AND posting_id IS NOT NULL
)
UPDATE public.applications a
   SET deleted_at = now()
  FROM ranked r
 WHERE a.id = r.id
   AND r.rn > 1;

-- --- pipeline_leads ------------------------------------------------------
WITH ranked AS (
  SELECT
    l.id,
    l.clerk_user_id,
    l.posting_id,
    CASE
      WHEN l.status = 'promoted' AND a.status IS NOT NULL THEN
        CASE a.status
          WHEN 'offer'        THEN 100
          WHEN 'interviewing' THEN  90
          WHEN 'applied'      THEN  80
          WHEN 'rejected'     THEN  70
          WHEN 'evaluating'   THEN  60
          WHEN 'withdrawn'    THEN  50
          ELSE                       45
        END
      WHEN l.status = 'promoted'      THEN 45
      WHEN l.status = 'pending_review' THEN 40
      WHEN l.status = 'skipped'        THEN 20
      WHEN l.status = 'auto_skipped'   THEN 10
      ELSE                                   0
    END AS priority,
    l.email_date,
    l.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY l.clerk_user_id, l.posting_id
      ORDER BY
        CASE
          WHEN l.status = 'promoted' AND a.status IS NOT NULL THEN
            CASE a.status
              WHEN 'offer'        THEN 100
              WHEN 'interviewing' THEN  90
              WHEN 'applied'      THEN  80
              WHEN 'rejected'     THEN  70
              WHEN 'evaluating'   THEN  60
              WHEN 'withdrawn'    THEN  50
              ELSE                       45
            END
          WHEN l.status = 'promoted'      THEN 45
          WHEN l.status = 'pending_review' THEN 40
          WHEN l.status = 'skipped'        THEN 20
          WHEN l.status = 'auto_skipped'   THEN 10
          ELSE                                   0
        END DESC,
        l.email_date DESC NULLS LAST,
        l.created_at DESC
    ) AS rn
  FROM public.pipeline_leads l
  LEFT JOIN public.applications a
    ON a.id = l.promoted_application_id
   AND a.deleted_at IS NULL
  WHERE l.deleted_at IS NULL
    AND l.posting_id IS NOT NULL
)
UPDATE public.pipeline_leads pl
   SET deleted_at = now(),
       skip_reason = COALESCE(pl.skip_reason, 'Duplicate of another lead with same posting_id (auto-merged)')
  FROM ranked r
 WHERE pl.id = r.id
   AND r.rn > 1;
