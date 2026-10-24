-- PulsePlay AI News Worker: prevent public reads of draft/unpublished articles.
-- Apply manually after reviewing existing publication-status inconsistencies.
-- This migration does not modify article rows or automatically publish/archive content.

DROP POLICY IF EXISTS "Allow public read news" ON public.news;

CREATE POLICY "Public can read published news only"
ON public.news
FOR SELECT
TO anon, authenticated
USING (published = 'true' AND status = 'published');
