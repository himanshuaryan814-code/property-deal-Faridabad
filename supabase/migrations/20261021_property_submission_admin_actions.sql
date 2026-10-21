-- Admin-only edit and delete actions for seller submissions.
-- Run after the property submission workflow/table migrations.

do $$
begin
  if to_regclass('public.property_submissions') is null then
    raise exception 'public.property_submissions is required before adding admin submission actions';
  end if;
end
$$;

create or replace function public.update_property_submission(
  p_submission_id uuid,
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
  p_area_sqft numeric
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is distinct from 'a9906177-2107-4185-81ae-1631a891ed22'::uuid then
    raise exception 'Only the authorized administrator may edit property submissions';
  end if;

  update public.property_submissions
  set seller_name = p_seller_name,
      seller_phone = p_seller_phone,
      seller_email = p_seller_email,
      title = p_title,
      description = p_description,
      listing_type = p_listing_type,
      property_type = p_property_type,
      expected_price = p_expected_price,
      city = p_city,
      locality = p_locality,
      address = p_address,
      bedrooms = p_bedrooms,
      bathrooms = p_bathrooms,
      area_sqft = p_area_sqft,
      updated_at = now()
  where id = p_submission_id
    and status in ('uploading', 'pending', 'rejected');

  if not found then
    if exists (
      select 1
      from public.property_submissions
      where id = p_submission_id and status = 'approved'
    ) then
      raise exception 'Approved submissions must be edited from the property listings panel';
    end if;
    raise exception 'An editable property submission with that ID was not found';
  end if;

  return p_submission_id;
end;
$$;

revoke all on function public.update_property_submission(uuid, text, text, text, text, text, text, text, numeric, text, text, text, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.update_property_submission(uuid, text, text, text, text, text, text, text, numeric, text, text, text, integer, integer, numeric) to authenticated;

create or replace function public.delete_property_submission(p_submission_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is distinct from 'a9906177-2107-4185-81ae-1631a891ed22'::uuid then
    raise exception 'Only the authorized administrator may delete property submissions';
  end if;

  delete from public.property_submissions
  where id = p_submission_id;

  if not found then
    raise exception 'Property submission was not found';
  end if;

  return p_submission_id;
end;
$$;

revoke all on function public.delete_property_submission(uuid) from public, anon, authenticated;
grant execute on function public.delete_property_submission(uuid) to authenticated;

notify pgrst, 'reload schema';
