-- POD design concept persistence.
-- Apply manually in Supabase after review. No existing product/merchandise tables are modified.
create table if not exists public.pod_design_concepts (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled POD concept',
  prompt text not null,
  mode text not null default 'new' check (mode in ('new', 'improve')),
  product_name text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  artwork_path text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  decision_by uuid references auth.users(id) on delete set null,
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pod_design_concepts_created_at_idx
  on public.pod_design_concepts (created_at desc);
create index if not exists pod_design_concepts_status_idx
  on public.pod_design_concepts (status, created_at desc);

create table if not exists public.pod_design_concept_events (
  id bigint generated always as identity primary key,
  concept_id uuid not null references public.pod_design_concepts(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'approved', 'rejected')),
  previous_status text check (previous_status in ('draft', 'approved', 'rejected')),
  new_status text not null check (new_status in ('draft', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists pod_design_concept_events_concept_idx
  on public.pod_design_concept_events (concept_id, created_at desc);

alter table public.pod_design_concepts enable row level security;
alter table public.pod_design_concept_events enable row level security;

-- Intentionally no client-facing RLS policies. Access is through the API's
-- administrator-authenticated routes and its server-side Supabase client.
