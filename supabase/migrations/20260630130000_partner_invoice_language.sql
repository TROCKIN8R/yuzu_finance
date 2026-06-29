-- Partner invoice language (fr | en) — column may already exist from initial schema

alter table public.partners
  add column if not exists language text not null default 'fr';

update public.partners
set language = 'fr'
where language is null or language not in ('fr', 'en');

alter table public.partners
  drop constraint if exists partners_language_check;

alter table public.partners
  add constraint partners_language_check check (language in ('fr', 'en'));
