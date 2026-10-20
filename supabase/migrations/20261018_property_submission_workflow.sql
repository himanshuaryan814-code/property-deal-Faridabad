-- Property submission workflow.
-- Review supabase/inspect-existing-schema.sql first. This migration intentionally
-- stops if the table or private bucket already exists, or if shared storage
-- policies are not scoped to the authorized admin.
-- Run manually in Supabase SQL Editor only after reviewing these policies.

do $$
begin
  if to_regclass('public.property_submissions') is not null then
    raise exception 'public.property_submissions already exists; inspect its schema and policies before applying this migration';
  end if;

  if exists (select 1 from storage.buckets where id = 'property-submission-uploads') then
    raise exception 'property-submission-uploads bucket already exists; inspect its privacy and restrictions before applying this migration';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'SELECT', 'UPDATE', 'DELETE', 'ALL')
      and ('anon' = any(roles) or 'public' = any(roles))
  ) then
    raise exception 'An existing anonymous storage policy was found; inspect it before adding private submission photos to storage.objects';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'SELECT', 'UPDATE', 'DELETE', 'ALL')
      and 'authenticated' = any(roles)
      and position('a9906177-2107-4185-81ae-1631a891ed22' in coalesce(qual, '') || ' ' || coalesce(with_check, '')) = 0
  ) then
    raise exception 'An existing authenticated storage policy is not scoped to the authorized admin; inspect it before adding the private submission bucket';
  end if;
end
$$;

create table public.property_submissions (
  id uuid primary key,
  seller_name text not null check (length(btrim(seller_name)) between 1 and 120),
  seller_phone text not null check (seller_phone ~ '^[+0-9() -]{8,20}$' and length(btrim(seller_phone)) >= 8),
  seller_email text check (seller_email is null or length(seller_email) <= 254),
  title text not null check (length(btrim(title)) between 1 and 160),
  description text check (description is null or length(description) <= 5000),
  listing_type text not null check (listing_type in ('sale', 'rent')),
  property_type text not null check (length(btrim(property_type)) between 1 and 100),
  expected_price numeric not null check (expected_price >= 0),
  city text not null check (length(btrim(city)) between 1 and 120),
  locality text not null check (length(btrim(locality)) between 1 and 160),
  address text check (address is null or length(address) <= 300),
  bedrooms integer check (bedrooms is null or bedrooms >= 0),
  bathrooms integer check (bathrooms is null or bathrooms >= 0),
  area_sqft numeric check (area_sqft is null or area_sqft >= 0),
  expected_photo_count integer not null check (expected_photo_count between 0 and 10),
  status text not null default 'uploading' check (status in ('uploading', 'pending', 'approved', 'rejected')),
  property_id uuid references public.properties(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.property_submissions enable row level security;
revoke all on table public.property_submissions from anon, authenticated;
grant select on table public.property_submissions to authenticated;

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
);

-- Storage table privileges are global; the new bucket-scoped RLS policy below
-- is the only anonymous INSERT policy this migration permits.
grant insert on table storage.objects to anon;

create function public.can_upload_property_submission_photo(object_name text)
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

revoke all on function public.can_upload_property_submission_photo(text) from public;
grant execute on function public.can_upload_property_submission_photo(text) to anon, authenticated;

create policy property_submission_photo_insert
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'property-submission-uploads'
    and public.can_upload_property_submission_photo(name)
  );

create policy property_submission_photo_admin_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'property-submission-uploads'
    and auth.uid() = 'a9906177-2107-4185-81ae-1631a891ed22'::uuid
  );

create policy property_submission_photo_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'property-submission-uploads'
    and auth.uid() = 'a9906177-2107-4185-81ae-1631a891ed22'::uuid
  );

create function public.create_property_submission(
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

revoke all on function public.create_property_submission(uuid, text, text, text, text, text, text, text, numeric, text, text, text, integer, integer, numeric, integer) from public;
grant execute on function public.create_property_submission(uuid, text, text, text, text, text, text, text, numeric, text, text, text, integer, integer, numeric, integer) to anon, authenticated;

create function public.complete_property_submission(p_submission_id uuid)
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

revoke all on function public.complete_property_submission(uuid) from public;
grant execute on function public.complete_property_submission(uuid) to anon, authenticated;

create function public.approve_property_submission(
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

revoke all on function public.approve_property_submission(uuid, text[]) from public;
grant execute on function public.approve_property_submission(uuid, text[]) to authenticated;

create function public.reject_property_submission(p_submission_id uuid)
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
      select 1 from public.property_submissions
      where id = p_submission_id and status = 'rejected'
    ) then
      return p_submission_id;
    end if;
    raise exception 'Only an uploading or pending submission can be rejected';
  end if;

  return p_submission_id;
end;
$$;

revoke all on function public.reject_property_submission(uuid) from public;
grant execute on function public.reject_property_submission(uuid) to authenticated;
