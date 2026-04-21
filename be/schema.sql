-- Org Explorer Scraper Schema
-- Run this in your Supabase SQL editor

create table if not exists persons (
  aad_object_id         uuid primary key,
  full_name             text,
  email                 text,
  job_title             text,
  department            text,
  location              text,
  manager_aad_object_id uuid references persons(aad_object_id),
  is_manager            boolean default false,
  profile_picture_url   text,
  transitive_reports_count int default 0,
  direct_reports_count  int default 0,
  scraped_at            timestamptz default now()
);

-- Index for fast manager lookups
create index if not exists idx_persons_manager on persons(manager_aad_object_id);

-- Index for email lookups
create index if not exists idx_persons_email on persons(email);

-- Enable RLS
alter table persons enable row level security;

-- Allow full public access (no auth required)
create policy "allow all public"
  on persons
  for all
  to public
  using (true)
  with check (true);