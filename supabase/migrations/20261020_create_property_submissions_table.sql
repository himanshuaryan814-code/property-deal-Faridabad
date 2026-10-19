-- Creates the table used by PropertySubmissionForm.tsx and AdminRoutes.tsx.
-- Safe to rerun for this schema. It does not drop tables or change properties.
-- Review existing schema/policies first, then run manually in Supabase SQL Editor.

do $$
begin
  if to_regclass('public.properties') is null then
    raise exception 'public.properties is required for the submission relationship';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'property_submissions'
      and policyname <> 'property_submissions_admin_select'
  ) then
    raise exception 'Unexpected property_submissions policies exist; inspect their access before applying this migration';
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
  property_id uuid references public.properties(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
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
    check (status in ('uploading', 'pending', 'approved', 'rejected'))
);

-- Do not treat an unrelated table with the same name as compatible.
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

alter table public.property_submissions
  alter column id set default gen_random_uuid(),
  alter column expected_photo_count set default 0,
  alter column status set default 'uploading',
  alter column created_at set default now(),
  alter column updated_at set default now(),
  enable row level security;

-- All direct table writes are withheld. The public submission and admin review
-- RPCs remain the only intended write path; only the configured admin can read.
revoke all on table public.property_submissions from anon, authenticated;
grant select on table public.property_submissions to authenticated;

drop policy if exists property_submissions_admin_select on public.property_submissions;
create policy property_submissions_admin_select
  on public.property_submissions
  for select
  to authenticated
  using (auth.uid() = 'a9906177-2107-4185-81ae-1631a891ed22'::uuid);

notify pgrst, 'reload schema';
