import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { getSupabaseClient } from './lib/supabase';
import './property-submission.css';

const SUBMISSION_BUCKET = 'property-submission-uploads';
const MAX_PHOTOS = 10;
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type SubmissionDraft = {
  sellerName: string;
  sellerPhone: string;
  sellerEmail: string;
  title: string;
  description: string;
  propertyType: string;
  listingType: 'sale' | 'rent';
  price: string;
  city: string;
  locality: string;
  address: string;
  bedrooms: string;
  bathrooms: string;
  areaSqft: string;
};

const emptyDraft: SubmissionDraft = {
  sellerName: '',
  sellerPhone: '',
  sellerEmail: '',
  title: '',
  description: '',
  propertyType: 'house',
  listingType: 'sale',
  price: '',
  city: '',
  locality: '',
  address: '',
  bedrooms: '',
  bathrooms: '',
  areaSqft: '',
};

function fileExtension(file: File): string {
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  return 'webp';
}

function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

export default function PropertySubmissionForm() {
  const [draft, setDraft] = useState<SubmissionDraft>(emptyDraft);
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function update<K extends keyof SubmissionDraft>(key: K, value: SubmissionDraft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setError('');
    setNotice('');

    if (selected.length > MAX_PHOTOS) {
      setPhotos([]);
      setError(`Choose no more than ${MAX_PHOTOS} photos.`);
      event.target.value = '';
      return;
    }

    const invalid = selected.find(file => !PHOTO_TYPES.has(file.type) || file.size > MAX_PHOTO_SIZE_BYTES);
    if (invalid) {
      setPhotos([]);
      setError(`${invalid.name} is not a supported JPG, PNG, or WebP file up to 5 MiB.`);
      event.target.value = '';
      return;
    }

    setPhotos(selected);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError('');
    setNotice('');

    const price = Number(draft.price);
    const phone = draft.sellerPhone.trim();
    if (!/^\+?[0-9()\s-]{8,20}$/.test(phone)) {
      setError('Enter a valid phone number so the team can contact you.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Enter a valid expected price greater than or equal to zero.');
      return;
    }

    const numericFields = [
      ['bedrooms', optionalNumber(draft.bedrooms)],
      ['bathrooms', optionalNumber(draft.bathrooms)],
      ['area', optionalNumber(draft.areaSqft)],
    ] as const;
    const invalidNumeric = numericFields.find(([field, value]) => (
      value !== null
      && (
        !Number.isFinite(value)
        || value < 0
        || ((field === 'bedrooms' || field === 'bathrooms') && !Number.isInteger(value))
      )
    ));
    if (invalidNumeric) {
      setError(`Enter a valid non-negative ${invalidNumeric[0]} value.`);
      return;
    }

    if (!window.crypto?.randomUUID) {
      setError('This browser cannot securely create a submission reference. Please use a modern browser over HTTPS.');
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      const submissionId = window.crypto.randomUUID();
      const { data: createdId, error: createError } = await supabase.rpc('create_property_submission', {
        p_id: submissionId,
        p_seller_name: draft.sellerName.trim(),
        p_seller_phone: phone,
        p_seller_email: draft.sellerEmail.trim() || null,
        p_title: draft.title.trim(),
        p_description: draft.description.trim() || null,
        p_listing_type: draft.listingType,
        p_property_type: draft.propertyType,
        p_expected_price: price,
        p_city: draft.city.trim(),
        p_locality: draft.locality.trim(),
        p_address: draft.address.trim() || null,
        p_bedrooms: optionalNumber(draft.bedrooms),
        p_bathrooms: optionalNumber(draft.bathrooms),
        p_area_sqft: optionalNumber(draft.areaSqft),
        p_expected_photo_count: photos.length,
      });

      if (createError) throw createError;
      if (createdId !== submissionId) {
        throw new Error('The database returned an unexpected submission reference.');
      }

      const photoBucket = supabase.storage.from(SUBMISSION_BUCKET);
      for (const photo of photos) {
        const objectPath = `${submissionId}/${window.crypto.randomUUID()}.${fileExtension(photo)}`;
        const { error: uploadError } = await photoBucket.upload(objectPath, photo, {
          contentType: photo.type,
          upsert: false,
        });
        if (uploadError) {
          throw new Error(`The submission was created (${submissionId}), but ${photo.name} could not be uploaded: ${uploadError.message}. It remains private and is marked incomplete for admin review.`);
        }
      }

      const { data: completedId, error: completeError } = await supabase.rpc('complete_property_submission', {
        p_submission_id: submissionId,
      });
      if (completeError) {
        throw new Error(`Your property details were saved (${submissionId}), but photo verification could not be completed: ${completeError.message}. The submission remains private and is marked incomplete for admin review.`);
      }
      if (completedId !== submissionId) {
        throw new Error(`The database returned an unexpected completion reference for submission ${submissionId}.`);
      }

      setNotice(`Your property has been submitted for review. Reference: ${submissionId}. It will not appear publicly unless approved by Property Deal.`);
      setDraft(emptyDraft);
      setPhotos([]);
      formElement.reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'We could not submit your property. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="seller-form property-submission-form" onSubmit={handleSubmit}>
      <h3>Submit your property</h3>
      <p>Share the details for a private review. A submission is never published automatically.</p>
      <div className="form-row">
        <label>Full name<input required maxLength={120} value={draft.sellerName} onChange={event => update('sellerName', event.target.value)} autoComplete="name" placeholder="Your full name" /></label>
        <label>Phone number<input required maxLength={20} value={draft.sellerPhone} onChange={event => update('sellerPhone', event.target.value)} inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" /></label>
      </div>
      <label>Email address (optional)<input type="email" maxLength={254} value={draft.sellerEmail} onChange={event => update('sellerEmail', event.target.value)} autoComplete="email" placeholder="you@example.com" /></label>
      <label>Property title<input required maxLength={160} value={draft.title} onChange={event => update('title', event.target.value)} placeholder="A short title for your property" /></label>
      <label>Description<textarea maxLength={5000} rows={3} value={draft.description} onChange={event => update('description', event.target.value)} placeholder="Describe the property and anything a reviewer should know" /></label>
      <div className="form-row">
        <label>Property type<select value={draft.propertyType} onChange={event => update('propertyType', event.target.value)}>{[['house', 'House'], ['apartment', 'Apartment'], ['villa', 'Villa'], ['plot', 'Plot'], ['commercial', 'Commercial'], ['other', 'Other']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Listing purpose<select value={draft.listingType} onChange={event => update('listingType', event.target.value as SubmissionDraft['listingType'])}><option value="sale">Sale</option><option value="rent">Rent</option></select></label>
      </div>
      <label>Expected price (₹)<input required type="number" min="0" step="any" value={draft.price} onChange={event => update('price', event.target.value)} placeholder="Expected sale price or monthly rent" /></label>
      <div className="form-row">
        <label>City<input required maxLength={120} value={draft.city} onChange={event => update('city', event.target.value)} placeholder="City" /></label>
        <label>Locality<input required maxLength={160} value={draft.locality} onChange={event => update('locality', event.target.value)} placeholder="Locality / sector" /></label>
      </div>
      <label>Address details (optional)<input maxLength={300} value={draft.address} onChange={event => update('address', event.target.value)} placeholder="Street, block or nearby landmark" /></label>
      <div className="form-row property-submission-numbers">
        <label>Bedrooms<input type="number" min="0" step="1" value={draft.bedrooms} onChange={event => update('bedrooms', event.target.value)} /></label>
        <label>Bathrooms<input type="number" min="0" step="1" value={draft.bathrooms} onChange={event => update('bathrooms', event.target.value)} /></label>
        <label>Area (sq ft)<input type="number" min="0" step="any" value={draft.areaSqft} onChange={event => update('areaSqft', event.target.value)} /></label>
      </div>
      <label>Property photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handlePhotoSelection} aria-describedby="submission-photo-help" /></label>
      <small id="submission-photo-help" className="privacy-note">Up to {MAX_PHOTOS} JPG, PNG, or WebP photos, 5 MiB each. Photos are stored privately and only copied to public property storage after approval.</small>
      {photos.length > 0 && <small className="privacy-note">{photos.length} photo(s) selected.</small>}
      {error && <p className="submission-message submission-error" role="alert">{error}</p>}
      {notice && <p className="submission-message submission-success" role="status">{notice}</p>}
      <button className="button button-dark full" type="submit" disabled={busy}>
        {busy ? <LoaderCircle className="submission-spinner" size={16} /> : null}
        {busy ? 'Submitting property…' : 'Submit property for review'} {!busy && <ArrowRight size={16} />}
      </button>
      <small className="privacy-note">Your details are used for property review and follow-up. Pending and rejected submissions are not visible on the public listings page.</small>
    </form>
  );
}
