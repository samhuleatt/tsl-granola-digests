create table if not exists public.daily_digests (
  digest_date date primary key,
  subject text not null,
  html text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_daily_digests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_daily_digests_updated_at on public.daily_digests;

create trigger set_daily_digests_updated_at
before update on public.daily_digests
for each row
execute function public.set_daily_digests_updated_at();
