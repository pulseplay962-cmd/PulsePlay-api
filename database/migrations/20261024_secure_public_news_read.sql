-- PulsePlay AI News Worker: prevent public reads of draft/unpublished articles.
-- SAFETY GATE: allow consistent published and draft records, but refuse to
-- apply while the two publication fields disagree or either field is missing.
-- This migration never modifies article rows or automatically publishes/archives content.

DO $
DECLARE
  inconsistent_count bigint;
BEGIN
  SELECT COUNT(*)
  INTO inconsistent_count
  FROM public.news
  WHERE NOT (
    (published IS TRUE AND status = 'published')
    OR (published IS FALSE AND status = 'draft')
  );

  IF inconsistent_count > 0 THEN
    RAISE EXCEPTION
      'News publication safeguard not applied: % of % rows have inconsistent publication flags. Reconcile those records first.',
      inconsistent_count,
      (SELECT COUNT(*) FROM public.news);
  END IF;
END
$;

DROP POLICY IF EXISTS "Allow public read news" ON public.news;

CREATE POLICY "Public can read published news only"
ON public.news
FOR SELECT
TO anon, authenticated
USING (published = 'true' AND status = 'published');

-- Keep the admin dashboard able to inspect drafts and inconsistent records.
-- This is a separate permissive policy for authenticated administrators only.
CREATE POLICY "Admins can read all news"
ON public.news
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = auth.uid()
      AND profile.role = 'admin'
  )
);
