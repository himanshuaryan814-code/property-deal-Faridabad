-- Extend the existing inquiry workflow for commercial and plots/land categories.
-- Run manually after 20261021_property_inquiries.sql.

do $$
begin
  if to_regclass('public.property_inquiries') is null then
    raise exception 'public.property_inquiries is required before extending inquiry types';
  end if;
end
$$;

alter table public.property_inquiries
  drop constraint if exists property_inquiries_inquiry_type_check;
alter table public.property_inquiries
  add constraint property_inquiries_inquiry_type_check
  check (inquiry_type in ('buy', 'rent', 'sell', 'commercial', 'plots/land'));

create or replace function public.submit_property_inquiry(
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
  if p_inquiry_type is null
    or p_inquiry_type not in ('buy', 'rent', 'sell', 'commercial', 'plots/land') then
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

notify pgrst, 'reload schema';
