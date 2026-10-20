-- READ ONLY: inspect columns in all public tables. This includes submission
-- tables that may use a name other than "property", "listing", or "submission".
select
  table_name,
  column_name,
  data_type,
  udt_name,
  character_maximum_length,
  numeric_precision,
  numeric_scale,
  datetime_precision,
  is_nullable,
  column_default,
  is_identity,
  identity_generation,
  is_generated,
  generation_expression
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- READ ONLY: inspect primary keys, unique constraints, and foreign keys
-- needed to identify listing rows and understand submission relationships.
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  pg_get_constraintdef(pc.oid) as constraint_definition
from information_schema.table_constraints as tc
join pg_namespace as pn
  on pn.nspname = tc.constraint_schema
join pg_class as pr
  on pr.relname = tc.table_name
  and pr.relnamespace = pn.oid
join pg_constraint as pc
  on pc.conname = tc.constraint_name
  and pc.conrelid = pr.oid
where tc.table_schema = 'public'
  and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
order by tc.table_name, tc.constraint_type, tc.constraint_name;

-- READ ONLY: inspect CHECK constraints on all public tables before using any
-- publication or approval status in application code.
select
  tc.table_name,
  cc.check_clause
from information_schema.table_constraints as tc
join information_schema.check_constraints as cc
  on cc.constraint_schema = tc.constraint_schema
  and cc.constraint_name = tc.constraint_name
where tc.table_schema = 'public'
  and tc.constraint_type = 'CHECK'
order by tc.table_name, tc.constraint_name;

-- READ ONLY: inspect enum values used by public table columns.
select
  c.table_name,
  c.column_name,
  c.udt_name as enum_type,
  e.enumlabel as allowed_value
from information_schema.columns as c
join pg_type as t on t.typname = c.udt_name
  and t.typnamespace = 'public'::regnamespace
join pg_enum as e on e.enumtypid = t.oid
where c.table_schema = 'public'
order by c.table_name, c.column_name, e.enumsortorder;

-- READ ONLY: determine whether public tables currently enforce RLS.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;

-- READ ONLY: inspect every public-table policy and every storage.objects policy.
-- Storage policies are shared across buckets; inspect their conditions for
-- bucket_id = 'property-images' before deciding whether uploads are permitted.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- READ ONLY: inspect effective SQL privileges for Supabase client roles.
-- Policies do not grant SQL privileges; both grants and RLS must permit an
-- operation. These checks inspect grants only, not whether a row policy
-- permits a particular request.
select
  table_schema,
  table_name,
  role_name,
  has_table_privilege(
    role_name,
    format('%I.%I', table_schema, table_name),
    'SELECT'
  ) as can_select,
  has_table_privilege(
    role_name,
    format('%I.%I', table_schema, table_name),
    'INSERT'
  ) as can_insert,
  has_table_privilege(
    role_name,
    format('%I.%I', table_schema, table_name),
    'UPDATE'
  ) as can_update,
  has_table_privilege(
    role_name,
    format('%I.%I', table_schema, table_name),
    'DELETE'
  ) as can_delete
from (
  select table_schema, table_name
  from information_schema.tables
  where table_schema = 'public'
  union all
  select 'storage', 'objects'
) as relations
cross join (
  values ('anon'), ('authenticated')
) as roles(role_name)
order by table_schema, table_name, role_name;

-- READ ONLY: locate any policy in these schemas that explicitly references the
-- configured admin UUID.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where (
    coalesce(qual, '') ilike '%a9906177-2107-4185-81ae-1631a891ed22%'
    or coalesce(with_check, '') ilike '%a9906177-2107-4185-81ae-1631a891ed22%'
  )
  and (schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects'))
order by schemaname, tablename, policyname;

-- READ ONLY: confirm whether the expected image bucket exists and its settings.
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'property-images';

-- READ ONLY: inspect the submission objects used by
-- 20261019_property_submissions_schema_cache_fix.sql. That migration accepts
-- a compatible existing table/bucket but stops on an incompatible setup.
select
  to_regclass('public.property_submissions') as existing_submission_table,
  bucket.id as submission_bucket_id,
  bucket.public as submission_bucket_is_public,
  bucket.file_size_limit,
  bucket.allowed_mime_types,
  has_table_privilege('anon', 'storage.objects', 'INSERT') as anon_can_insert_storage_objects
from (values (1)) as seed(dummy)
left join storage.buckets as bucket
  on bucket.id = 'property-submission-uploads';

-- READ ONLY: inspect any pre-existing anonymous storage policy before adding
-- a private bucket; policies on storage.objects apply across buckets.
select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and cmd in ('INSERT', 'SELECT', 'UPDATE', 'DELETE', 'ALL')
  and ('anon' = any(roles) or 'public' = any(roles))
order by policyname;

-- READ ONLY: identify authenticated storage policies that are not visibly
-- scoped to this project's authorized admin. The migration stops if any are
-- found because these policies can also apply to the new private bucket.
select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and cmd in ('INSERT', 'SELECT', 'UPDATE', 'DELETE', 'ALL')
  and 'authenticated' = any(roles)
  and position(
    'a9906177-2107-4185-81ae-1631a891ed22'
    in coalesce(qual, '') || ' ' || coalesce(with_check, '')
  ) = 0
order by policyname;
