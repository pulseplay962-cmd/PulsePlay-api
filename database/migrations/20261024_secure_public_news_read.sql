-- PulsePlay AI News Worker: secure public news reads and administrator writes.
-- SAFETY GATE: allow consistent published and draft records, but refuse to
-- apply while the two publication fields disagree or either field is missing.
-- This migration never modifies article rows or automatically publishes/archives content.

DO $migration$
DECLARE
  inconsistent_count bigint;
BEGIN
  SELECT COUNT(*)
  INTO inconsistent_count
  FROM public.news
  WHERE published IS NULL
     OR status IS NULL
     OR NOT (
       (published = 'true' AND status = 'published')
       OR (published = 'false' AND status = 'draft')
     );

  IF inconsistent_count > 0 THEN
    RAISE EXCEPTION
      'News publication safeguard not applied: % of % rows have inconsistent publication flags. Reconcile those records first.',
      inconsistent_count,
      (SELECT COUNT(*) FROM public.news);
  END IF;
END
$migration$;

-- Remove the permissive policies that allow anonymous reads or any signed-in
-- user to insert news. Older policies in this project may have literal quote
-- characters in their names, so remove both naming variants explicitly.
DO $policy_cleanup$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'news'
      AND policyname IN (
        'Allow public read news',
        '"Allow public read news"',
        'Allow authenticated insert news',
        '"Allow authenticated insert news"',
        'Public can read published news only',
        'Admins can read all news',
        'Admins can insert news',
        'Admins can update news',
        'Admins can delete news'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.news', policy_record.policyname);
  END LOOP;
END
$policy_cleanup$;

-- PostgreSQL permissive policies combine with OR.
DROP POLICY IF EXISTS "Allow public read news" ON public.news;
DROP POLICY IF EXISTS "Allow authenticated insert news" ON public.news;
DROP POLICY IF EXISTS "Public can read published news only" ON public.news;
DROP POLICY IF EXISTS "Admins can read all news" ON public.news;
DROP POLICY IF EXISTS "Admins can insert news" ON public.news;
DROP POLICY IF EXISTS "Admins can update news" ON public.news;
DROP POLICY IF EXISTS "Admins can delete news" ON public.news;

CREATE POLICY "Public can read published news only"
ON public.news
FOR SELECT
TO anon, authenticated
USING (published = 'true' AND status = 'published');

-- Keep drafts visible to authenticated administrators in the admin dashboard.
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

CREATE POLICY "Admins can insert news"
ON public.news
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = auth.uid()
      AND profile.role = 'admin'
  )
);

CREATE POLICY "Admins can update news"
ON public.news
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = auth.uid()
      AND profile.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = auth.uid()
      AND profile.role = 'admin'
  )
);

CREATE POLICY "Admins can delete news"
ON public.news
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = auth.uid()
      AND profile.role = 'admin'
  )
);
