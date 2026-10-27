# POD design concept persistence setup

This feature is intentionally isolated from the existing `products` and `merchandise` tables. Saving or approving a concept does not create a Printful product or publish anything.

## Required before deploying the API

1. Review and apply `supabase/migrations/202610260001_pod_design_concepts.sql` to the intended Supabase project.
2. Create a Storage bucket named `pod-design-concepts`.
   - Set **Public bucket** to **off** (private).
   - Set a 10 MB file-size limit.
   - Restrict allowed MIME types to `image/png`, `image/jpeg`, and `image/webp`.
3. Do not add anonymous or browser-client storage policies for this bucket. The current routes are protected by `requireAdmin` and use the server-side Supabase client.
4. Verify that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured for the API deployment. The service-role key must remain server-side and must never be exposed to the frontend.
5. Confirm the migration and private bucket exist before deploying this API branch. If either is missing, concept operations are expected to fail closed.

## API

- `GET /api/ai/pod/concepts` — list the latest 100 concepts with short-lived signed artwork URLs.
- `POST /api/ai/pod/concepts` — save a draft concept and artwork.
- `PATCH /api/ai/pod/concepts/:id/status` — record an approval or rejection.

All routes require administrator authentication. Artwork uploads are limited to PNG/JPEG/WebP and 10 MB. A successful decision requires a corresponding audit event. The API never invokes Printful from these routes.

## Review / rollout safeguards

- Apply the SQL migration only after reviewing it; this branch does not apply migrations automatically.
- Create and verify the private bucket manually before rollout; this branch does not change Storage settings.
- Test unauthorized requests, missing-bucket/migration errors, upload failures, persistence after reload, and status audit events in a non-production environment.
- Confirm that no Printful product or public post is created during any test.
- Review API service-key configuration. `lib/supabase.js` currently falls back to `SUPABASE_PUBLISHABLE_KEY` when the service-role key is missing. This feature requires storage permissions unavailable to a publishable key; the route should fail safely, but production configuration should be corrected before rollout.
