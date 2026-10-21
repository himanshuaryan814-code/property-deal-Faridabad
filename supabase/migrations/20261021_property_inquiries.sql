-- Property inquiry flow. Review this migration before applying it in Supabase.
-- It creates a separate inquiry table; property_submissions remains unchanged.

do $$
begin
  if to_regclass('public.property_inquiries') is not null then
    raise exception 'public.property_inquiries already exists; inspect its schema and policies before applying this migration';
  end if;
end
$$;

create table public.property_inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_type text not null check (inquiry_type in ('buy', 'rent', 'sell')),
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  mobile_number text not null check (
    mobile_number ~ '^[+0-9() -]{8,20}$'
    and length(regexp_replace(mobile_number, '[^0-9]', '', 'g')) between 8 and 15
  ),
  email_address text check (email_address is null or length(email_address) <= 254),
  preferred_location text check (preferred_location is null or length(preferred_location) <= 160),
  property_type text check (property_type is null or length(property_type) <= 100),
  budget text check (budget is null or length(budget) <= 100),
  additional_message text check (additional_message is null or length(additional_message) <= 2000),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.property_inquiries enable row level security;
revoke all on table public.property_inquiries from public, anon, authenticated;
grant select on table public.property_inquiries to authenticated;

create policy property_inquiries_admin_select
  on public.property_inquiries
  for select
  to authenticated
  using (auth.uid() = 'a9906177-2107-4185-81ae-1631a891ed22'::uuid);

create function public.submit_property_inquiry(
  p_inquiry_type text,
  p_full_name text,
  p_mobile_number text,
  p_email_address text default null,
  p_preferred_location text default null,
  p_property_type text default null,
  p_budget text default null,
  p_additional_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  created_inquiry_id uuid;
  normalized_email text := nullif(btrim(p_email_address), '');
begin
  if p_inquiry_type is null or p_inquiry_type not in ('buy', 'rent', 'sell') then
    raise exception 'Select a valid inquiry type.' using errcode = '22023';
  end if;

  if p_full_name is null or length(btrim(p_full_name)) not between 1 and 120 then
    raise exception 'Enter a name between 1 and 120 characters.' using errcode = '22023';
  end if;

  if p_mobile_number is null
    or p_mobile_number !~ '^[+0-9() -]{8,20}$'
    or length(regexp_replace(p_mobile_number, '[^0-9]', '', 'g')) not between 8 and 15 then
    raise exception 'Enter a valid mobile number.' using errcode = '22023';
  end if;

  if normalized_email is not null
    and (
      length(normalized_email) > 254
      or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ) then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  if p_preferred_location is not null and length(p_preferred_location) > 160
    or p_property_type is not null and length(p_property_type) > 100
    or p_budget is not null and length(p_budget) > 100
    or p_additional_message is not null and length(p_additional_message) > 2000 then
    raise exception 'One or more optional inquiry fields are too long.' using errcode = '22023';
  end if;

  insert into public.property_inquiries (
    inquiry_type,
    full_name,
    mobile_number,
    email_address,
    preferred_location,
    property_type,
    budget,
    additional_message
  )
  values (
    p_inquiry_type,
    btrim(p_full_name),
    btrim(p_mobile_number),
    normalized_email,
    nullif(btrim(p_preferred_location), ''),
    nullif(btrim(p_property_type), ''),
    nullif(btrim(p_budget), ''),
    nullif(btrim(p_additional_message), '')
  )
  returning id into created_inquiry_id;

  return created_inquiry_id;
end
$$;

revoke all on function public.submit_property_inquiry(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_property_inquiry(text, text, text, text, text, text, text, text)
  to anon, authenticated;
