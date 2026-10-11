-- Vibh-Anu CRM schema. Run once in the Supabase SQL editor.
-- Roles live in auth.users.app_metadata.role (only the service key can set it).

create type lead_stage as enum ('communication', 'vigilance', 'support', 'sales', 'claimed');

create table leads (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (length(trim(name)) > 0),
  contact_number        text not null check (contact_number ~ '^[6-9][0-9]{9}$'),
  postal_address        text,
  visit_date            date,
  visit_time            time,
  remark                text,
  stage                 lead_stage not null default 'communication',

  -- call recording (Vigilance)
  audio_path            text,
  audio_duration_s      numeric,
  transcript            text,
  ai_summary            text,
  ai_tag                text check (ai_tag in ('hot', 'warm', 'cold')),

  -- Support checks
  date_ok               boolean not null default false,
  time_ok               boolean not null default false,
  address_ok            boolean not null default false,

  -- Sales listening + claim
  audio_play_started_at timestamptz,
  audio_played_at       timestamptz,
  claimed_by            uuid references auth.users,
  claimed_at            timestamptz,

  created_by            uuid references auth.users,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index leads_stage_idx on leads (stage, created_at desc);

create table lead_events (
  id          bigint generated always as identity primary key,
  lead_id     uuid not null references leads on delete cascade,
  actor_email text not null,
  role        text not null,
  action      text not null,
  at          timestamptz not null default now()
);

create index lead_events_lead_idx on lead_events (lead_id, at);

-- Contact number is locked once Marketing creates the lead, enforced by the DB itself.
create function leads_guard() returns trigger language plpgsql as $$
begin
  if new.contact_number is distinct from old.contact_number then
    raise exception 'Contact number is locked after creation';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger leads_guard before update on leads
  for each row execute function leads_guard();

-- RLS on, no client policies: the browser cannot read or write these tables.
-- All access goes through server actions that check the user's role first.
alter table leads enable row level security;
alter table lead_events enable row level security;

-- Private bucket for call recordings (signed URLs only).
insert into storage.buckets (id, name, public, file_size_limit)
values ('call-recordings', 'call-recordings', false, 26214400)
on conflict (id) do nothing;
