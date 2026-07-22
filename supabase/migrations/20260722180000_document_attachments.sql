-- Document attachments + private Supabase Storage bucket

do $$ begin
  create type public.document_entity_type as enum ('invoice', 'expense', 'employee_expense');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.document_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type public.document_entity_type not null,
  entity_id uuid not null,
  storage_path text not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_attachments_user_id_idx on public.document_attachments (user_id);
create index if not exists document_attachments_entity_idx on public.document_attachments (entity_type, entity_id);

drop trigger if exists document_attachments_set_user_id on public.document_attachments;
create trigger document_attachments_set_user_id
  before insert on public.document_attachments
  for each row execute function public.set_user_id();

drop trigger if exists document_attachments_updated_at on public.document_attachments;
create trigger document_attachments_updated_at
  before update on public.document_attachments
  for each row execute function public.set_updated_at();

alter table public.document_attachments enable row level security;

drop policy if exists "document_attachments_all_own" on public.document_attachments;
create policy "document_attachments_all_own" on public.document_attachments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.document_attachments from anon, public;
grant select, insert, update, delete on table public.document_attachments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documents_select_own" on storage.objects;
create policy "documents_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "documents_insert_own" on storage.objects;
create policy "documents_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "documents_update_own" on storage.objects;
create policy "documents_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "documents_delete_own" on storage.objects;
create policy "documents_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
