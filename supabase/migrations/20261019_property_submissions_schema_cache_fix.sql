-- Idempotent property submission workflow migration.
-- Review supabase/inspect-existing-schema.sql first. This migration creates
-- the exact schema expected by the frontend, while stopping on an incompatible
-- pre-existing table, bucket, or shared storage policy.
-- Run manually in Supabase Dashboard -> SQL Editor. Do not run from the client.

do $$
begin
  if to_regclass('public.properties') is null then
    raise exception 'public.properties is required by the submission approval workflow';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'property_submissions'
      and policyname <> 'property_submissions_admin_select'
  ) then
    raise exception 'Unexpected public.property_submissions policies exist; inspect them before applying this migration';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'SELECT', 'UPDATE', 'DELETE', 'ALL')
      and ('anon' = any(roles) or 'public' = any(roles))
      and policyname <> 'property_submission_photo_insert'
  ) then
    raise exception 'An existing anonymous storage policy may apply to all buckets; inspect it before applying this migration';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'SELECT', 'UPDATE', 'DELETE', 'ALL')
      and 'authenticated' = any(roles)
      and policyname not in (
        'property_submission_photo_insert',
        'property_submission_photo_admin_select',
        'property_submission_photo_admin_delete'
      )
      and position(
        'a9906177-2107-4185-81ae-1631a891ed22'
        in coalesce(qual, '') || ' ' || coalesce(with_check, '')
      ) = 0
  ) then
    raise exception 'An existing authenticated storage policy is not visibly scoped to the authorized admin; inspect it before applying this migration';
  end if;

  if exists (
    select 1
    from storage.buckets
    where id = 'property-submission-uploads'
      and (
        public is distinct from false
        or file_size_limit is distinct from 5242880
        or allowed_mime_types is distinct from array['image/jpeg', 'image/png', 'image/webp']::text[]
      )
  ) then
    raise exception 'property-submission-uploads exists with incompatible privacy or file restrictions; inspect it before applying this migration';
  end if;
end
$$;

create table if not exists public.property_submissions (
  id uuid primary key default gen_random_uuid(),
  seller_name text not null,
  seller_phone text not null,
  seller_email text,
  title text not null,
  description text,
  listing_type text not null,
  property_type text not null,
  expected_price numeric not null,
  city text not null,
  locality text not null,
  address text,
  bedrooms integer,
  bathrooms integer,
  area_sqft numeric,
  expected_photo_count integer not null default 0,
  status text not null default 'uploading',
  property_id uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_submissions_seller_name_check
    check (length(btrim(seller_name)) between 1 and 120),
  constraint property_submissions_seller_phone_check
    check (seller_phone ~ '^[+0-9() -]{8,20}$' and length(btrim(seller_phone)) >= 8),
  constraint property_submissions_seller_email_check
    check (seller_email is null or length(seller_email) <= 254),
  constraint property_submissions_title_check
    check (length(btrim(title)) between 1 and 160),
  constraint property_submissions_description_check
    check (description is null or length(description) <= 5000),
  constraint property_submissions_listing_type_check
    check (listing_type in ('sale', 'rent')),
  constraint property_submissions_property_type_check
    check (length(btrim(property_type)) between 1 and 100),
  constraint property_submissions_expected_price_check
    check (expected_price >= 0),
  constraint property_submissions_city_check
    check (length(btrim(city)) between 1 and 120),
  constraint property_submissions_locality_check
    check (length(btrim(locality)) between 1 and 160),
  constraint property_submissions_address_check
    check (address is null or length(address) <= 300),
  constraint property_submissions_bedrooms_check
    check (bedrooms is null or bedrooms >= 0),
  constraint property_submissions_bathrooms_check
    check (bathrooms is null or bathrooms >= 0),
  constraint property_submissions_area_sqft_check
    check (area_sqft is null or area_sqft >= 0),
  constraint property_submissions_expected_photo_count_check
    check (expected_photo_count between 0 and 10),
  constraint property_submissions_status_check
    check (status in ('uploading', 'pending', 'approved', 'rejected')),
  constraint property_submissions_property_id_fkey
    foreign key (property_id) references public.properties(id) on delete set null,
  constraint property_submissions_reviewed_by_fkey
    foreign key (reviewed_by) references auth.users(id) on delete set null
);

-- Do not silently adapt an unrelated table with the same name. The existing
-- 20261018 migration has the same column types; this validates that schema too.
do $$
declare
  incompatible_columns text;
begin
  with expected(column_name, udt_name, is_nullable) as (
    values
      ('id', 'uuid', 'NO'),
      ('seller_name', 'text', 'NO'),
      ('seller_phone', 'text', 'NO'),
      ('seller_email', 'text', 'YES'),
      ('title', 'text', 'NO'),
      ('description', 'text', 'YES'),
      ('listing_type', 'text', 'NO'),
      ('property_type', 'text', 'NO'),
      ('expected_price', 'numeric', 'NO'),
      ('city', 'text', 'NO'),
      ('locality', 'text', 'NO'),
      ('address', 'text', 'YES'),
      ('bedrooms', 'int4', 'YES'),
      ('bathrooms', 'int4', 'YES'),
      ('area_sqft', 'numeric', 'YES'),
      ('expected_photo_count', 'int4', 'NO'),
      ('status', 'text', 'NO'),
      ('property_id', 'uuid', 'YES'),
      ('reviewed_by', 'uuid', 'YES'),
      ('reviewed_at', 'timestamptz', 'YES'),
      ('created_at', 'timestamptz', 'NO'),
      ('updated_at', 'timestamptz', 'NO')
  ),
  actual as (
    select column_name, udt_name, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'property_submissions'
  ),
  problems as (
    select expected.column_name
    from expected
    left join actual using (column_name)
    where actual.column_name is null
       or actual.udt_name <> expected.udt_name
       or actual.is_nullable <> expected.is_nullable
    union all
    select actual.column_name
    from actual
    left join expected using (column_name)
    where expected.column_name is null
  )
  select string_agg(column_name, ', ' order by column_name)
  into incompatible_columns
  from problems;

  if incompatible_columns is not null then
    raise exception 'public.property_submissions has incompatible or unexpected columns: %', incompatible_columns;
  end if;
end
$$;

-- Ensure named checks and relationships also exist when upgrading the earlier
-- compatible workflow migration. Every addition is guarded for safe reruns.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_seller_name_check') then
    alter table public.property_submissions add constraint property_submissions_seller_name_check check (length(btrim(seller_name)) between 1 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_seller_phone_check') then
    alter table public.property_submissions add constraint property_submissions_seller_phone_check check (seller_phone ~ '^[+0-9() -]{8,20}$' and length(btrim(seller_phone)) >= 8);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_seller_email_check') then
    alter table public.property_submissions add constraint property_submissions_seller_email_check check (seller_email is null or length(seller_email) <= 254);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_title_check') then
    alter table public.property_submissions add constraint property_submissions_title_check check (length(btrim(title)) between 1 and 160);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_description_check') then
    alter table public.property_submissions add constraint property_submissions_description_check check (description is null or length(description) <= 5000);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_listing_type_check') then
    alter table public.property_submissions add constraint property_submissions_listing_type_check check (listing_type in ('sale', 'rent'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_property_type_check') then
    alter table public.property_submissions add constraint property_submissions_property_type_check check (length(btrim(property_type)) between 1 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_expected_price_check') then
    alter table public.property_submissions add constraint property_submissions_expected_price_check check (expected_price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_city_check') then
    alter table public.property_submissions add constraint property_submissions_city_check check (length(btrim(city)) between 1 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_locality_check') then
    alter table public.property_submissions add constraint property_submissions_locality_check check (length(btrim(locality)) between 1 and 160);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_address_check') then
    alter table public.property_submissions add constraint property_submissions_address_check check (address is null or length(address) <= 300);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_bedrooms_check') then
    alter table public.property_submissions add constraint property_submissions_bedrooms_check check (bedrooms is null or bedrooms >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_bathrooms_check') then
    alter table public.property_submissions add constraint property_submissions_bathrooms_check check (bathrooms is null or bathrooms >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_area_sqft_check') then
    alter table public.property_submissions add constraint property_submissions_area_sqft_check check (area_sqft is null or area_sqft >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_expected_photo_count_check') then
    alter table public.property_submissions add constraint property_submissions_expected_photo_count_check check (expected_photo_count between 0 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_status_check') then
    alter table public.property_submissions add constraint property_submissions_status_check check (status in ('uploading', 'pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_property_id_fkey') then
    alter table public.property_submissions add constraint property_submissions_property_id_fkey foreign key (property_id) references public.properties(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.property_submissions'::regclass and conname = 'property_submissions_reviewed_by_fkey') then
    alter table public.property_submissions add constraint property_submissions_reviewed_by_fkey foreign key (reviewed_by) references auth.users(id) on delete set null;
  end if;
end
$$;

alter table public.property_submissions alter column id set default gen_random_uuid();
alter table public.property_submissions alter column expected_photo_count set default 0;
alter table public.property_submissions alter column status set default 'uploading';
alter table public.property_submissions alter column created_at set default now();
alter table public.property_submissions alter column updated_at set default now();
alter table public.property_submissions enable row level security;
revoke all on table public.property_submissions from anon, authenticated;
grant select on table public.property_submissions to authenticated;

drop policy if exists property_submissions_admin_select on public.property_submissions;
create policy property_submissions_admin_select
  on public.property_submissions
  for select
  to authenticated
  using (auth.uid() = 'a9906177-2107-4185-81ae-1631a891ed22'::uuid);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-submission-uploads',
  'property-submission-uploads',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

grant insert on table storage.objects to anon;

create or replace function public.can_upload_property_submission_photo(object_name text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  submission public.property_submissions%rowtype;
  uploaded_count integer;
  submission_folder text;
begin
  if object_name !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|png|webp)$' then
    return false;
  end if;

  submission_folder := split_part(object_name, '/', 1);
  perform pg_advisory_xact_lock(hashtextextended(submission_folder, 0));

  select * into submission
  from public.property_submissions as ps
  where ps.id::text = submission_folder
    and ps.status = 'uploading';
  if not found then
    return false;
  end if;

  select count(*)::integer into uploaded_count
  from storage.objects as stored_file
  where stored_file.bucket_id = 'property-submission-uploads'
    and split_part(stored_file.name, '/', 1) = submission_folder;

  return uploaded_count < submission.expected_photo_count;
end;
$$;

revoke all on function public.can_upload_property_submission_photo(text) from public, anon, authenticated;
grant execute on function public.can_upload_property_submission_photo(text) to anon, authenticated;

drop policy if exists property_submission_photo_insert on storage.objects;
create policy property_submission_photo_insert
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'property-submission-uploads'
    and public.can_upload_property_submission_photo(name)
  );

drop policy if exists property_submission_photo_admin_select on storage.objects;
create policy property_submission_photo_admin_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'property-submission-uploads'
    and auth.uid() = 'a9906177-2107-4185-81ae-1631a891ed22'::uuid
  );

drop policy if exists property_submission_photo_admin_delete on storage.objects;
create policy property_submission_photo_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'property-submission-uploads'
    and auth.uid() = 'a9906177-2107-4185-81ae-1631a891ed22'::uuid
  );

create or replace function public.create_property_submission(
  p_id uuid,
  p_seller_name text,
  p_seller_phone text,
  p_seller_email text,
  p_title text,
  p_description text,
  p_listing_type text,
  p_property_type text,
  p_expected_price numeric,
  p_city text,
  p_locality text,
  p_address text,
  p_bedrooms integer,
  p_bathrooms integer,
  p_area_sqft numeric,
  p_expected_photo_count integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.property_submissions (
    id, seller_name, seller_phone, seller_email, title, description,
    listing_type, property_type, expected_price, city, locality, address,
    bedrooms, bathrooms, area_sqft, expected_photo_count, status
  )
  values (
    p_id, btrim(p_seller_name), btrim(p_seller_phone), nullif(btrim(p_seller_email), ''),
    btrim(p_title), nullif(btrim(p_description), ''), p_listing_type, btrim(p_property_type),
    p_expected_price, btrim(p_city), btrim(p_locality), nullif(btrim(p_address), ''),
    p_bedrooms, p_bathrooms, p_area_sqft, p_expected_photo_count, 'uploading'
  );
  return p_id;
end;
$$;

revoke all on function public.create_property_submission(uuid, text, text, text, text, text, text, text, numeric, text, text, text, integer, integer, numeric, integer) from public, anon, authenticated;
grant execute on function public.create_property_submission(uuid, text, text, text, text, text, text, text, numeric, text, text, text, integer, integer, numeric, integer) to anon, authenticated;

create or replace function public.complete_property_submission(p_submission_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  submission public.property_submissions%rowtype;
  uploaded_count integer;
begin
  select * into submission
  from public.property_submissions
  where id = p_submission_id
  for update;
  if not found then
    raise exception 'Property submission was not found';
  end if;
  if submission.status = 'pending' then
    return p_submission_id;
  end if;
  if submission.status <> 'uploading' then
    raise exception 'Property submission is not available for completion';
  end if;

  select count(*)::integer into uploaded_count
  from storage.objects
  where bucket_id = 'property-submission-uploads'
    and split_part(name, '/', 1) = p_submission_id::text;
  if uploaded_count <> submission.expected_photo_count then
    raise exception 'Uploaded photo count does not match the submitted photo count';
  end if;

  update public.property_submissions
  set status = 'pending', updated_at = now()
  where id = p_submission_id;
  return p_submission_id;
end;
$$;

revoke all on function public.complete_property_submission(uuid) from public, anon, authenticated;
grant execute on function public.complete_property_submission(uuid) to anon, authenticated;

create or replace function public.approve_property_submission(
  p_submission_id uuid,
  p_public_image_urls text[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  submission public.property_submissions%rowtype;
  created_property_id uuid;
  property_location text;
begin
  if auth.uid() is distinct from 'a9906177-2107-4185-81ae-1631a891ed22'::uuid then
    raise exception 'Only the authorized administrator may approve property submissions';
  end if;

  select * into submission
  from public.property_submissions
  where id = p_submission_id
  for update;
  if not found then
    raise exception 'Property submission was not found';
  end if;
  if submission.status = 'approved' and submission.property_id is not null then
    return submission.property_id;
  end if;
  if submission.status <> 'pending' then
    raise exception 'Only a pending submission can be approved';
  end if;

  if coalesce(cardinality(p_public_image_urls), 0) <> submission.expected_photo_count
     or exists (
       select 1
       from unnest(coalesce(p_public_image_urls, array[]::text[])) as public_urls(url)
       where url is null
          or url !~ '^https://[^/]+/storage/v1/object/public/property-images/a9906177-2107-4185-81ae-1631a891ed22/'
     ) then
    raise exception 'Approved photo URLs do not match the authorized property image upload';
  end if;

  property_location := concat_ws(
    ', ',
    nullif(btrim(submission.address), ''),
    nullif(btrim(submission.locality), ''),
    nullif(btrim(submission.city), '')
  );

  insert into public.properties (
    title, description, listing_type, property_type, price, location,
    bedrooms, bathrooms, area_sqft, image_urls, contact_name, contact_phone,
    submitted_by, status
  )
  values (
    submission.title, submission.description, submission.listing_type,
    submission.property_type, submission.expected_price, property_location,
    submission.bedrooms, submission.bathrooms, submission.area_sqft,
    coalesce(p_public_image_urls, array[]::text[]), submission.seller_name,
    submission.seller_phone, null, 'published'
  )
  returning id into created_property_id;

  update public.property_submissions
  set status = 'approved',
      property_id = created_property_id,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_submission_id;
  return created_property_id;
end;
$$;

revoke all on function public.approve_property_submission(uuid, text[]) from public, anon, authenticated;
grant execute on function public.approve_property_submission(uuid, text[]) to authenticated;

create or replace function public.reject_property_submission(p_submission_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is distinct from 'a9906177-2107-4185-81ae-1631a891ed22'::uuid then
    raise exception 'Only the authorized administrator may reject property submissions';
  end if;

  update public.property_submissions
  set status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_submission_id
    and status in ('uploading', 'pending');

  if not found then
    if exists (
      select 1
      from public.property_submissions
      where id = p_submission_id and status = 'rejected'
    ) then
      return p_submission_id;
    end if;
    raise exception 'Only an uploading or pending submission can be rejected';
  end if;
  return p_submission_id;
end;
$$;

revoke all on function public.reject_property_submission(uuid) from public, anon, authenticated;
grant execute on function public.reject_property_submission(uuid) to authenticated;

notify pgrst, 'reload schema';
