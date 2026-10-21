import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ArrowLeft, Building2, Check, Eye, LoaderCircle, LogOut, MessageCircle, Pencil, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { getSupabaseClient } from '../lib/supabase';
import './admin.css';

const AUTHORIZED_ADMIN_ID = 'a9906177-2107-4185-81ae-1631a891ed22';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isObject(error) && typeof error.message === 'string') return error.message;
  return 'An unexpected error occurred.';
}

type PropertyDraft = {
  title: string;
  description: string;
  price: string;
  location: string;
  propertyType: string;
  purpose: 'sale' | 'rent' | '';
  bedrooms: string;
  bathrooms: string;
  area: string;
  publicationStatus: 'pending' | 'published' | 'rejected';
};

const emptyPropertyDraft: PropertyDraft = {
  title: '',
  description: '',
  price: '',
  location: '',
  propertyType: '',
  purpose: '',
  bedrooms: '',
  bathrooms: '',
  area: '',
  publicationStatus: 'pending',
};

type PropertyStatus = PropertyDraft['publicationStatus'];

type PropertyRecord = {
  id: string;
  title: string;
  description: string | null;
  listing_type: 'sale' | 'rent';
  property_type: string;
  price: number;
  location: string;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqft: number | null;
  image_urls: string[];
  status: PropertyStatus;
  created_at: string;
  updated_at: string;
};

const PROPERTY_COLUMNS = [
  'id',
  'title',
  'description',
  'listing_type',
  'property_type',
  'price',
  'location',
  'bedrooms',
  'bathrooms',
  'area_sqft',
  'image_urls',
  'status',
  'created_at',
  'updated_at',
].join(',');
const MAX_PROPERTY_PHOTOS = 10;
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const PROPERTY_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PROPERTY_IMAGE_BUCKET = 'property-images';
const SUBMISSION_IMAGE_BUCKET = 'property-submission-uploads';
const SUBMISSION_COLUMNS = [
  'id',
  'seller_name',
  'seller_phone',
  'seller_email',
  'title',
  'description',
  'listing_type',
  'property_type',
  'expected_price',
  'city',
  'locality',
  'address',
  'bedrooms',
  'bathrooms',
  'area_sqft',
  'expected_photo_count',
  'status',
  'property_id',
  'created_at',
].join(',');
const MAX_SUBMISSION_PHOTOS = 10;

type SubmissionStatus = 'uploading' | 'pending' | 'approved' | 'rejected';
type PropertySubmission = {
  id: string;
  seller_name: string;
  seller_phone: string;
  seller_email: string | null;
  title: string;
  description: string | null;
  listing_type: 'sale' | 'rent';
  property_type: string;
  expected_price: number;
  city: string;
  locality: string;
  address: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqft: number | null;
  expected_photo_count: number;
  status: SubmissionStatus;
  property_id: string | null;
  created_at: string;
};

type SubmissionPhoto = { path: string; url: string };
type PropertyInquiry = {
  id: string;
  inquiry_type: 'buy' | 'rent' | 'sell' | 'commercial' | 'plots/land';
  full_name: string;
  mobile_number: string;
  email_address: string | null;
  preferred_location: string | null;
  property_type: string | null;
  budget: string | null;
  additional_message: string | null;
  status: 'new' | 'contacted' | 'closed';
  created_at: string;
};

const INQUIRY_COLUMNS = [
  'id',
  'inquiry_type',
  'full_name',
  'mobile_number',
  'email_address',
  'preferred_location',
  'property_type',
  'budget',
  'additional_message',
  'status',
  'created_at',
].join(',');

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePropertyInquiries(value: unknown): PropertyInquiry[] {
  if (!Array.isArray(value)) {
    throw new Error('The property inquiries query returned an unexpected response.');
  }

  return value.map((row, index) => {
    if (!isObject(row)) throw new Error(`Inquiry row ${index + 1} is not a valid object.`);
    const {
      id, inquiry_type, full_name, mobile_number, email_address, preferred_location,
      property_type, budget, additional_message, status, created_at,
    } = row;
    if (
      typeof id !== 'string'
      || (inquiry_type !== 'buy' && inquiry_type !== 'rent' && inquiry_type !== 'sell' && inquiry_type !== 'commercial' && inquiry_type !== 'plots/land')
      || typeof full_name !== 'string'
      || typeof mobile_number !== 'string'
      || (email_address !== null && typeof email_address !== 'string')
      || (preferred_location !== null && typeof preferred_location !== 'string')
      || (property_type !== null && typeof property_type !== 'string')
      || (budget !== null && typeof budget !== 'string')
      || (additional_message !== null && typeof additional_message !== 'string')
      || (status !== 'new' && status !== 'contacted' && status !== 'closed')
      || typeof created_at !== 'string'
    ) {
      throw new Error(`Inquiry row ${index + 1} contains invalid fields.`);
    }
    return {
      id,
      inquiry_type,
      full_name,
      mobile_number,
      email_address,
      preferred_location,
      property_type,
      budget,
      additional_message,
      status,
      created_at,
    };
  });
}

function parseDatabaseNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`The properties query returned an invalid ${field} value.`);
  }
  return parsed;
}

function parseNullableDatabaseNumber(value: unknown, field: string): number | null {
  return value === null ? null : parseDatabaseNumber(value, field);
}

function parsePropertyRows(value: unknown): PropertyRecord[] {
  if (!Array.isArray(value)) {
    throw new Error('The properties query returned an unexpected response.');
  }

  return value.map((row, index) => {
    if (!isObject(row)) {
      throw new Error(`Property row ${index + 1} is not a valid object.`);
    }

    const {
      id,
      title,
      description,
      listing_type,
      property_type,
      price,
      location,
      bedrooms,
      bathrooms,
      area_sqft,
      image_urls,
      status,
      created_at,
      updated_at,
    } = row;

    if (
      typeof id !== 'string'
      || typeof title !== 'string'
      || !(description === null || typeof description === 'string')
      || !(listing_type === 'sale' || listing_type === 'rent')
      || typeof property_type !== 'string'
      || typeof location !== 'string'
      || !Array.isArray(image_urls)
      || !image_urls.every(imageUrl => typeof imageUrl === 'string')
      || !(status === 'pending' || status === 'published' || status === 'rejected')
      || typeof created_at !== 'string'
      || typeof updated_at !== 'string'
    ) {
      throw new Error(`Property row ${index + 1} does not match the verified properties schema.`);
    }

    return {
      id,
      title,
      description,
      listing_type,
      property_type,
      price: parseDatabaseNumber(price, 'price'),
      location,
      bedrooms: parseNullableDatabaseNumber(bedrooms, 'bedrooms'),
      bathrooms: parseNullableDatabaseNumber(bathrooms, 'bathrooms'),
      area_sqft: parseNullableDatabaseNumber(area_sqft, 'area_sqft'),
      image_urls,
      status,
      created_at,
      updated_at,
    };
  });
}

function parseSubmissions(value: unknown): PropertySubmission[] {
  if (!Array.isArray(value)) throw new Error('The submissions query returned an unexpected response.');

  return value.map((row, index) => {
    if (!isObject(row)) throw new Error(`Submission row ${index + 1} is not a valid object.`);
    const {
      id, seller_name, seller_phone, seller_email, title, description, listing_type,
      property_type, expected_price, city, locality, address, bedrooms, bathrooms,
      area_sqft, expected_photo_count, status, property_id, created_at,
    } = row;

    if (
      typeof id !== 'string'
      || typeof seller_name !== 'string'
      || typeof seller_phone !== 'string'
      || !(seller_email === null || typeof seller_email === 'string')
      || typeof title !== 'string'
      || !(description === null || typeof description === 'string')
      || !(listing_type === 'sale' || listing_type === 'rent')
      || typeof property_type !== 'string'
      || typeof city !== 'string'
      || typeof locality !== 'string'
      || !(address === null || typeof address === 'string')
      || !(status === 'uploading' || status === 'pending' || status === 'approved' || status === 'rejected')
      || !(property_id === null || typeof property_id === 'string')
      || typeof created_at !== 'string'
    ) {
      throw new Error(`Submission row ${index + 1} does not match the configured property_submissions schema.`);
    }

    const expectedPhotoCount = parseDatabaseNumber(expected_photo_count, 'expected_photo_count');
    if (!Number.isInteger(expectedPhotoCount) || expectedPhotoCount < 0 || expectedPhotoCount > MAX_SUBMISSION_PHOTOS) {
      throw new Error(`Submission row ${index + 1} has an invalid expected photo count.`);
    }

    return {
      id,
      seller_name,
      seller_phone,
      seller_email,
      title,
      description,
      listing_type,
      property_type,
      expected_price: parseDatabaseNumber(expected_price, 'expected_price'),
      city,
      locality,
      address,
      bedrooms: parseNullableDatabaseNumber(bedrooms, 'bedrooms'),
      bathrooms: parseNullableDatabaseNumber(bathrooms, 'bathrooms'),
      area_sqft: parseNullableDatabaseNumber(area_sqft, 'area_sqft'),
      expected_photo_count: expectedPhotoCount,
      status,
      property_id,
      created_at,
    };
  });
}

async function fetchPropertySubmissions(): Promise<PropertySubmission[]> {
  const { data, error: queryError } = await getSupabaseClient()
    .from('property_submissions')
    .select(SUBMISSION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100);

  if (queryError) throw queryError;
  return parseSubmissions(data);
}

async function fetchPropertyInquiries(): Promise<PropertyInquiry[]> {
  const { data, error: queryError } = await getSupabaseClient()
    .from('property_inquiries')
    .select(INQUIRY_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100);

  if (queryError) throw queryError;
  return parsePropertyInquiries(data);
}

async function fetchPropertyListings(): Promise<PropertyRecord[]> {
  const { data, error: queryError } = await getSupabaseClient()
    .from('properties')
    .select(PROPERTY_COLUMNS)
    .order('created_at', { ascending: false });

  if (queryError) throw queryError;
  return parsePropertyRows(data);
}

function uploadedObjectPath(imageUrl: string): string | null {
  try {
    const url = new URL(imageUrl);
    const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
    if (!configuredUrl || url.origin !== new URL(configuredUrl).origin) return null;

    const path = url.pathname;
    const ownBucketPrefix = `/storage/v1/object/public/${PROPERTY_IMAGE_BUCKET}/${AUTHORIZED_ADMIN_ID}/`;
    if (!path.startsWith(ownBucketPrefix)) return null;
    const objectPath = decodeURIComponent(path.slice(ownBucketPrefix.length));
    return objectPath || null;
  } catch {
    return null;
  }
}

function photoExtension(file: File): string {
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  return 'webp';
}

function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) throw signInError;

      if (data.user.id !== AUTHORIZED_ADMIN_ID) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          throw new Error(
            `This account is not authorized, and sign-out failed: ${signOutError.message}`,
          );
        }
        setError('This account is not authorized to access the admin area.');
        return;
      }

      window.location.assign('/admin');
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-page">
      <a className="admin-back-link" href="/">
        <ArrowLeft size={16} /> Back to Property Deal
      </a>
      <section className="admin-card admin-login-card" aria-labelledby="admin-login-title">
        <div className="admin-brand-mark"><Building2 size={22} /></div>
        <span className="admin-eyebrow">PROPERTY DEAL · ADMIN</span>
        <h1 id="admin-login-title">Welcome back</h1>
        <p className="admin-muted">Sign in with the authorized administrator account.</p>
        <form className="admin-form" onSubmit={handleSubmit}>
          <label>
            Email address
            <input
              autoComplete="username"
              type="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              type="password"
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </label>
          {error && <p className="admin-message admin-error" role="alert">{error}</p>}
          <button className="admin-button admin-button-primary" type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="admin-spinner" size={17} /> : <ShieldCheck size={17} />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="admin-small-note">Administrator accounts are created in Supabase, not on this page.</p>
      </section>
    </main>
  );
}

function AdminDashboard() {
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [propertiesError, setPropertiesError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [propertyDraft, setPropertyDraft] = useState<PropertyDraft>(emptyPropertyDraft);
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [formError, setFormError] = useState('');
  const [formNotice, setFormNotice] = useState('');
  const [submissions, setSubmissions] = useState<PropertySubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [submissionsError, setSubmissionsError] = useState('');
  const [inquiries, setInquiries] = useState<PropertyInquiry[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(true);
  const [inquiriesError, setInquiriesError] = useState('');
  const [submissionNotice, setSubmissionNotice] = useState('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [submissionPhotos, setSubmissionPhotos] = useState<Record<string, SubmissionPhoto[]>>({});
  const [photoLoadingId, setPhotoLoadingId] = useState<string | null>(null);
  const [processingSubmissionId, setProcessingSubmissionId] = useState<string | null>(null);

  async function loadProperties() {
    setPropertiesLoading(true);
    setPropertiesError('');
    try {
      setProperties(await fetchPropertyListings());
    } catch (loadError) {
      setPropertiesError(errorMessage(loadError));
    } finally {
      setPropertiesLoading(false);
    }
  }

  async function loadSubmissions() {
    setSubmissionsLoading(true);
    setSubmissionsError('');
    try {
      setSubmissions(await fetchPropertySubmissions());
    } catch (loadError) {
      setSubmissionsError(errorMessage(loadError));
    } finally {
      setSubmissionsLoading(false);
    }
  }

  async function loadInquiries() {
    setInquiriesLoading(true);
    setInquiriesError('');
    try {
      setInquiries(await fetchPropertyInquiries());
    } catch (loadError) {
      setInquiriesError(errorMessage(loadError));
    } finally {
      setInquiriesLoading(false);
    }
  }

  async function loadSubmissionPhotos(submission: PropertySubmission) {
    setPhotoLoadingId(submission.id);
    setSubmissionsError('');
    try {
      const supabase = getSupabaseClient();
      const { data: files, error: listError } = await supabase.storage
        .from(SUBMISSION_IMAGE_BUCKET)
        .list(submission.id, { limit: MAX_SUBMISSION_PHOTOS + 1 });
      if (listError) throw listError;
      if (!files) throw new Error('Storage returned no submission photo list.');
      if (files.length > MAX_SUBMISSION_PHOTOS) {
        throw new Error(`Submission ${submission.id} has more photos than the configured limit.`);
      }

      const photos = await Promise.all(files.map(async file => {
        const path = `${submission.id}/${file.name}`;
        const { data, error: urlError } = await supabase.storage
          .from(SUBMISSION_IMAGE_BUCKET)
          .createSignedUrl(path, 60 * 60);
        if (urlError) throw urlError;
        if (!data?.signedUrl) throw new Error(`No secure preview URL was returned for ${file.name}.`);
        return { path, url: data.signedUrl };
      }));
      setSubmissionPhotos(current => ({ ...current, [submission.id]: photos }));
    } catch (photoError) {
      setSubmissionsError(`Could not load secure photo previews for ${submission.title}: ${errorMessage(photoError)}`);
    } finally {
      setPhotoLoadingId(null);
    }
  }

  async function toggleSubmissionDetails(submission: PropertySubmission) {
    if (selectedSubmissionId === submission.id) {
      setSelectedSubmissionId(null);
      return;
    }
    setSelectedSubmissionId(submission.id);
    if (!submissionPhotos[submission.id]) await loadSubmissionPhotos(submission);
  }

  async function removeStoredPhotos(bucket: string, paths: string[]): Promise<string | null> {
    if (!paths.length) return null;
    const { error: removeError } = await getSupabaseClient().storage.from(bucket).remove(paths);
    return removeError ? removeError.message : null;
  }

  async function removeUnreferencedPublicPhotos(
    propertyId: string,
    paths: string[],
    urls: string[],
  ): Promise<string | null> {
    const supabase = getSupabaseClient();
    const { data: property, error: queryError } = await supabase
      .from('properties')
      .select('image_urls')
      .eq('id', propertyId)
      .maybeSingle();
    if (queryError) return `Could not verify published photo URLs; copied files were retained: ${queryError.message}`;
    if (!property || !Array.isArray(property.image_urls) || !property.image_urls.every((url: unknown) => typeof url === 'string')) {
      return 'Could not verify published photo URLs; copied files were retained.';
    }

    const referencedUrls = new Set<string>(property.image_urls);
    const unusedPaths = paths.filter((_, index) => !referencedUrls.has(urls[index]));
    return removeStoredPhotos(PROPERTY_IMAGE_BUCKET, unusedPaths);
  }

  async function handleApproveSubmission(submission: PropertySubmission) {
    if (submission.status !== 'pending') return;
    setProcessingSubmissionId(submission.id);
    setSubmissionsError('');
    setSubmissionNotice('');
    const publicImagePaths: string[] = [];
    let preservePublicImages = false;

    try {
      const supabase = getSupabaseClient();
      const { data: files, error: listError } = await supabase.storage
        .from(SUBMISSION_IMAGE_BUCKET)
        .list(submission.id, { limit: MAX_SUBMISSION_PHOTOS + 1 });
      if (listError) throw listError;
      if (!files) throw new Error('Storage returned no submission photo list.');
      if (files.length !== submission.expected_photo_count) {
        throw new Error(`This submission expects ${submission.expected_photo_count} photo(s), but ${files.length} private photo(s) are available. It cannot be approved until the photo set is complete.`);
      }

      const publicImageUrls: string[] = [];
      for (const file of files) {
        const privatePath = `${submission.id}/${file.name}`;
        const { data: downloaded, error: downloadError } = await supabase.storage
          .from(SUBMISSION_IMAGE_BUCKET)
          .download(privatePath);
        if (downloadError) throw downloadError;
        if (!downloaded) throw new Error(`Could not retrieve private photo ${file.name}.`);

        const mimeType = downloaded.type.toLowerCase();
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
          throw new Error(`Private photo ${file.name} has an unsupported image type.`);
        }
        const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
        const targetPath = `${AUTHORIZED_ADMIN_ID}/${submission.id}/${window.crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(PROPERTY_IMAGE_BUCKET)
          .upload(targetPath, downloaded, { contentType: mimeType, upsert: false });
        if (uploadError) throw uploadError;
        publicImagePaths.push(targetPath);

        const { data: publicData } = supabase.storage.from(PROPERTY_IMAGE_BUCKET).getPublicUrl(targetPath);
        if (!publicData.publicUrl) throw new Error(`No public URL was returned for approved photo ${file.name}.`);
        publicImageUrls.push(publicData.publicUrl);
      }

      const { data: propertyId, error: approvalError } = await supabase.rpc('approve_property_submission', {
        p_submission_id: submission.id,
        p_public_image_urls: publicImageUrls,
      });

      if (approvalError) {
        const { data: current, error: checkError } = await supabase
          .from('property_submissions')
          .select('status, property_id')
          .eq('id', submission.id)
          .maybeSingle();
        if (checkError) {
          preservePublicImages = true;
          throw new Error(`Approval failed: ${approvalError.message}. Could not verify final status: ${checkError.message}. Copied photos were retained because the property may already have been published.`);
        }
        if (current?.status === 'approved' && typeof current.property_id === 'string') {
          setSubmissionNotice(`This submission was approved successfully (property ${current.property_id}).`);
          const publicCleanupError = await removeUnreferencedPublicPhotos(current.property_id, publicImagePaths, publicImageUrls);
          if (publicCleanupError) {
            setSubmissionNotice(previous => `${previous} ${publicCleanupError}`);
          }
          const cleanupError = await removeStoredPhotos(SUBMISSION_IMAGE_BUCKET, files.map(file => `${submission.id}/${file.name}`));
          if (cleanupError) {
            setSubmissionNotice(previous => `${previous} Private-photo cleanup also failed: ${cleanupError}`);
          } else {
            setSubmissionPhotos(currentPhotos => {
              const { [submission.id]: _removed, ...remaining } = currentPhotos;
              return remaining;
            });
          }
          await Promise.all([loadProperties(), loadSubmissions()]);
          return;
        }

        const cleanupError = await removeStoredPhotos(PROPERTY_IMAGE_BUCKET, publicImagePaths);
        const cleanupMessage = cleanupError ? ` Uploaded public photo cleanup also failed: ${cleanupError}` : '';
        throw new Error(`Could not approve submission: ${approvalError.message}.${cleanupMessage}`);
      }

      if (typeof propertyId !== 'string') {
        preservePublicImages = true;
        throw new Error('The approval RPC did not return a property ID. Copied photos were retained because the database may already have published the property.');
      }

      setSubmissionNotice(`Submission approved and published as property ${propertyId}.`);
      const publicCleanupError = await removeUnreferencedPublicPhotos(propertyId, publicImagePaths, publicImageUrls);
      if (publicCleanupError) {
        setSubmissionNotice(previous => `${previous} ${publicCleanupError}`);
      }
      const privateCleanupError = await removeStoredPhotos(SUBMISSION_IMAGE_BUCKET, files.map(file => `${submission.id}/${file.name}`));
      if (privateCleanupError) {
        setSubmissionNotice(previous => `${previous} Private-photo cleanup also failed: ${privateCleanupError}`);
      } else {
        setSubmissionPhotos(currentPhotos => {
          const { [submission.id]: _removed, ...remaining } = currentPhotos;
          return remaining;
        });
      }
      await Promise.all([loadProperties(), loadSubmissions()]);
    } catch (approveError) {
      const cleanupError = preservePublicImages ? null : await removeStoredPhotos(PROPERTY_IMAGE_BUCKET, publicImagePaths);
      const cleanupMessage = cleanupError ? ` Uploaded public photo cleanup also failed: ${cleanupError}` : '';
      setSubmissionsError(`${errorMessage(approveError)}${cleanupMessage}`);
    } finally {
      setProcessingSubmissionId(null);
    }
  }

  async function handleRejectSubmission(submission: PropertySubmission) {
    if (submission.status !== 'pending' && submission.status !== 'uploading') return;
    setProcessingSubmissionId(submission.id);
    setSubmissionsError('');
    setSubmissionNotice('');

    try {
      const { data: rejectedId, error: rejectError } = await getSupabaseClient()
        .rpc('reject_property_submission', { p_submission_id: submission.id });
      if (rejectError) throw rejectError;
      if (rejectedId !== submission.id) throw new Error('The rejection RPC returned an unexpected submission reference.');

      let cleanupError: string | null = null;
      if (submission.expected_photo_count > 0) {
        const { data: files, error: listError } = await getSupabaseClient().storage
          .from(SUBMISSION_IMAGE_BUCKET)
          .list(submission.id, { limit: MAX_SUBMISSION_PHOTOS + 1 });
        if (listError) cleanupError = listError.message;
        else if (files) cleanupError = await removeStoredPhotos(SUBMISSION_IMAGE_BUCKET, files.map(file => `${submission.id}/${file.name}`));
      }

      setSubmissionNotice(cleanupError
        ? `Submission rejected. Private photo cleanup failed: ${cleanupError}`
        : 'Submission rejected. It will not be published.');
      if (!cleanupError) {
        setSubmissionPhotos(currentPhotos => {
          const { [submission.id]: _removed, ...remaining } = currentPhotos;
          return remaining;
        });
      }
      await loadSubmissions();
    } catch (rejectError) {
      setSubmissionsError(`Could not reject submission: ${errorMessage(rejectError)}`);
    } finally {
      setProcessingSubmissionId(null);
    }
  }

  async function handleUpdateSubmission(event: FormEvent<HTMLFormElement>, submission: PropertySubmission) {
    event.preventDefault();
    if (submission.status === 'approved') return;

    setProcessingSubmissionId(submission.id);
    setSubmissionsError('');
    setSubmissionNotice('');

    try {
      const formData = new FormData(event.currentTarget);
      const field = (name: string) => String(formData.get(name) ?? '').trim();
      const phone = field('seller_phone');
      const phoneDigits = phone.replace(/\D/g, '');
      if (!/^\+?[0-9()\s-]{8,20}$/.test(phone) || phoneDigits.length < 8 || phoneDigits.length > 15) {
        throw new Error('Enter a valid phone number with 8 to 15 digits.');
      }

      const expectedPrice = Number(field('expected_price'));
      if (!Number.isFinite(expectedPrice) || expectedPrice < 0) {
        throw new Error('Enter a valid expected price greater than or equal to zero.');
      }

      const optionalNumber = (name: string, integer = false): number | null => {
        const value = field(name);
        if (!value) return null;
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
          throw new Error(`Enter a valid non-negative ${name.replace('_', ' ')} value.`);
        }
        return number;
      };

      const listingType = field('listing_type');
      if (listingType !== 'sale' && listingType !== 'rent') {
        throw new Error('Choose Sale or Rent for the listing type.');
      }

      const { data: updatedId, error: updateError } = await getSupabaseClient().rpc('update_property_submission', {
        p_submission_id: submission.id,
        p_seller_name: field('seller_name'),
        p_seller_phone: phone,
        p_seller_email: field('seller_email') || null,
        p_title: field('title'),
        p_description: field('description') || null,
        p_listing_type: listingType,
        p_property_type: field('property_type'),
        p_expected_price: expectedPrice,
        p_city: field('city'),
        p_locality: field('locality'),
        p_address: field('address') || null,
        p_bedrooms: optionalNumber('bedrooms', true),
        p_bathrooms: optionalNumber('bathrooms', true),
        p_area_sqft: optionalNumber('area_sqft'),
      });
      if (updateError) throw updateError;
      if (updatedId !== submission.id) {
        throw new Error('The update RPC returned an unexpected submission reference.');
      }

      setEditingSubmissionId(null);
      setSubmissionNotice('Submission details updated.');
      await loadSubmissions();
    } catch (updateError) {
      setSubmissionsError(`Could not update submission: ${errorMessage(updateError)}`);
    } finally {
      setProcessingSubmissionId(null);
    }
  }

  async function handleDeleteSubmission(submission: PropertySubmission) {
    const publishedNote = submission.status === 'approved'
      ? ' The already-published property will not be deleted.'
      : '';
    if (!window.confirm(`Permanently delete the submission from ${submission.seller_name}?${publishedNote}`)) return;

    setProcessingSubmissionId(submission.id);
    setSubmissionsError('');
    setSubmissionNotice('');
    try {
      const bucket = getSupabaseClient().storage.from(SUBMISSION_IMAGE_BUCKET);
      const { data: files, error: listError } = await bucket.list(submission.id, {
        limit: MAX_SUBMISSION_PHOTOS + 1,
      });
      if (listError) throw listError;
      if (!files) throw new Error('Storage returned no submission photo list.');
      if (files.length > MAX_SUBMISSION_PHOTOS) {
        throw new Error('This submission has more private photos than the configured limit. Review the storage folder before deleting it.');
      }

      const cleanupError = await removeStoredPhotos(
        SUBMISSION_IMAGE_BUCKET,
        files.map(file => `${submission.id}/${file.name}`),
      );
      if (cleanupError) {
        throw new Error(`Private photos could not be removed, so the submission was retained: ${cleanupError}`);
      }

      const { data: deletedId, error: deleteError } = await getSupabaseClient().rpc('delete_property_submission', {
        p_submission_id: submission.id,
      });
      if (deleteError) {
        throw new Error(`Private photos were removed, but the submission could not be deleted: ${deleteError.message}`);
      }
      if (deletedId !== submission.id) {
        throw new Error('The delete RPC returned an unexpected submission reference.');
      }

      setEditingSubmissionId(null);
      setSelectedSubmissionId(current => current === submission.id ? null : current);
      setSubmissionPhotos(current => {
        const { [submission.id]: _removed, ...remaining } = current;
        return remaining;
      });
      setSubmissionNotice(
        submission.status === 'approved'
          ? 'Submission deleted. Its published property remains available in the property listings panel.'
          : 'Submission and private photos deleted.',
      );
      await loadSubmissions();
    } catch (deleteError) {
      setSubmissionsError(`Could not delete submission: ${errorMessage(deleteError)}`);
    } finally {
      setProcessingSubmissionId(null);
    }
  }

  useEffect(() => {
    let active = true;

    async function verifyAdmin() {
      try {
        const { data, error: userError } = await getSupabaseClient().auth.getUser();
        if (userError) throw userError;

        if (!data.user) {
          window.location.replace('/admin/login');
          return;
        }

        if (data.user.id !== AUTHORIZED_ADMIN_ID) {
          const { error: signOutError } = await getSupabaseClient().auth.signOut();
          if (signOutError) throw signOutError;
          if (active) setError('This account is not authorized to access the admin area.');
          return;
        }

        if (active) {
          setEmail(data.user.email ?? '');
          setUserId(data.user.id);
          void loadSubmissions();
          void loadInquiries();
          try {
            const listings = await fetchPropertyListings();
            if (active) setProperties(listings);
          } catch (loadError) {
            if (active) setPropertiesError(errorMessage(loadError));
          } finally {
            if (active) setPropertiesLoading(false);
          }
        }
      } catch (verifyError) {
        if (
          verifyError instanceof Error
          && (
            verifyError.name === 'AuthSessionMissingError'
            || /auth session missing/i.test(verifyError.message)
          )
        ) {
          window.location.replace('/admin/login');
          return;
        }
        if (
          verifyError instanceof Error
          && verifyError.message.includes('Supabase is not configured')
        ) {
          window.location.replace('/admin/login');
          return;
        }
        if (active) setError(errorMessage(verifyError));
      } finally {
        if (active) setLoading(false);
      }
    }

    void verifyAdmin();
    return () => {
      active = false;
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    setError('');

    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut();
      if (signOutError) throw signOutError;
      window.location.replace('/admin/login');
    } catch (signOutError) {
      setError(errorMessage(signOutError));
      setSigningOut(false);
    }
  }

  function updatePropertyDraft<K extends keyof PropertyDraft>(
    field: K,
    value: PropertyDraft[K],
  ) {
    setPropertyDraft(current => ({ ...current, [field]: value }));
    setFormError('');
    setFormNotice('');
  }

  function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';

    const invalidType = files.find(file => !PROPERTY_PHOTO_TYPES.has(file.type));
    const oversized = files.find(file => file.size > MAX_PHOTO_SIZE_BYTES);

    const existingPhotoCount = editingId
      ? properties.find(property => property.id === editingId)?.image_urls.length ?? 0
      : 0;
    if (files.length + existingPhotoCount > MAX_PROPERTY_PHOTOS) {
      setSelectedPhotos([]);
      setFormError(`A listing can have no more than ${MAX_PROPERTY_PHOTOS} photos in total.`);
      return;
    }
    if (invalidType) {
      setSelectedPhotos([]);
      setFormError('Photos must be JPG, PNG, or WebP images.');
      return;
    }
    if (oversized) {
      setSelectedPhotos([]);
      setFormError('Each photo must be 5 MB or smaller.');
      return;
    }

    setSelectedPhotos(files);
    setFormError('');
    setFormNotice('');
  }

  function startEditing(property: PropertyRecord) {
    setEditingId(property.id);
    setPropertyDraft({
      title: property.title,
      description: property.description ?? '',
      price: String(property.price),
      location: property.location,
      propertyType: property.property_type,
      purpose: property.listing_type,
      bedrooms: property.bedrooms === null ? '' : String(property.bedrooms),
      bathrooms: property.bathrooms === null ? '' : String(property.bathrooms),
      area: property.area_sqft === null ? '' : String(property.area_sqft),
      publicationStatus: property.status,
    });
    setSelectedPhotos([]);
    setFormError('');
    setFormNotice('');
  }

  function resetPropertyForm() {
    setEditingId(null);
    setPropertyDraft(emptyPropertyDraft);
    setSelectedPhotos([]);
    setFormError('');
    setFormNotice('');
  }

  async function uploadPhotos(files: File[]) {
    const bucket = getSupabaseClient().storage.from(PROPERTY_IMAGE_BUCKET);
    const uploaded: { path: string; url: string }[] = [];

    for (const file of files) {
      const path = `${userId}/${crypto.randomUUID()}.${photoExtension(file)}`;
      const { error: uploadError } = await bucket.upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });

      if (uploadError) {
        let cleanupMessage = '';
        if (uploaded.length) {
          try {
            const { error: cleanupError } = await bucket.remove(uploaded.map(photo => photo.path));
            if (cleanupError) cleanupMessage = ` Cleanup also failed: ${cleanupError.message}`;
          } catch (cleanupError) {
            cleanupMessage = ` Cleanup also failed: ${errorMessage(cleanupError)}`;
          }
        }
        throw new Error(
          `Could not upload ${file.name}: ${uploadError.message}`
          + cleanupMessage,
        );
      }

      uploaded.push({
        path,
        url: bucket.getPublicUrl(path).data.publicUrl,
      });
    }

    return uploaded;
  }

  async function handlePropertySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    setFormNotice('');

    const price = Number(propertyDraft.price);
    if (
      !propertyDraft.title.trim()
      || !propertyDraft.price
      || !Number.isFinite(price)
      || price < 0
      || !propertyDraft.location.trim()
      || !propertyDraft.propertyType.trim()
      || !propertyDraft.purpose
    ) {
      setFormError('Complete all required fields with a valid non-negative price.');
      return;
    }

    const bedrooms = propertyDraft.bedrooms === '' ? null : Number(propertyDraft.bedrooms);
    const bathrooms = propertyDraft.bathrooms === '' ? null : Number(propertyDraft.bathrooms);
    const areaSqft = propertyDraft.area === '' ? null : Number(propertyDraft.area);
    if (
      [bedrooms, bathrooms, areaSqft].some(value => (
        value !== null && (!Number.isFinite(value) || value < 0)
      ))
      || (bedrooms !== null && !Number.isInteger(bedrooms))
      || (bathrooms !== null && !Number.isInteger(bathrooms))
    ) {
      setFormError('Bedrooms and bathrooms must be whole non-negative numbers; area must be non-negative.');
      return;
    }

    const currentProperty = editingId
      ? properties.find(property => property.id === editingId)
      : undefined;
    const existingImages = currentProperty?.image_urls ?? [];
    if (selectedPhotos.length > 0 && existingImages.length + selectedPhotos.length > MAX_PROPERTY_PHOTOS) {
      setFormError(`A listing can have no more than ${MAX_PROPERTY_PHOTOS} photos in total.`);
      return;
    }
    if (!userId || userId !== AUTHORIZED_ADMIN_ID) {
      setFormError('Your authenticated admin session could not be verified. Sign out and sign in again.');
      return;
    }

    setSaving(true);
    let uploaded: { path: string; url: string }[] = [];
    let saved = false;
    try {
      uploaded = await uploadPhotos(selectedPhotos);
      const propertyValues = {
        title: propertyDraft.title.trim(),
        description: propertyDraft.description.trim() || null,
        listing_type: propertyDraft.purpose,
        property_type: propertyDraft.propertyType.trim(),
        price,
        location: propertyDraft.location.trim(),
        bedrooms,
        bathrooms,
        area_sqft: areaSqft,
        image_urls: [...existingImages, ...uploaded.map(photo => photo.url)],
        status: propertyDraft.publicationStatus,
      };

      const supabase = getSupabaseClient();
      const { data: savedRow, error: saveError } = editingId
        ? await supabase
          .from('properties')
          .update({ ...propertyValues, updated_at: new Date().toISOString() })
          .eq('id', editingId)
          .select(PROPERTY_COLUMNS)
          .maybeSingle()
        : await supabase
          .from('properties')
          .insert({ ...propertyValues, submitted_by: userId })
          .select(PROPERTY_COLUMNS)
          .single();

      if (saveError) throw saveError;
      if (!savedRow) {
        throw new Error('No listing was saved. The row may no longer exist or the current RLS policy did not allow the operation.');
      }

      saved = true;
      const savedProperties = parsePropertyRows([savedRow]);
      const savedProperty = savedProperties[0];
      setProperties(current => editingId
        ? current.map(property => property.id === editingId ? savedProperty : property)
        : [savedProperty, ...current]);
      const notice = editingId ? 'Listing updated successfully.' : 'Listing created successfully.';
      resetPropertyForm();
      setFormNotice(notice);
    } catch (saveError) {
      let message = errorMessage(saveError);
      if (!saved && uploaded.length > 0) {
        try {
          const { error: cleanupError } = await getSupabaseClient()
            .storage
            .from(PROPERTY_IMAGE_BUCKET)
            .remove(uploaded.map(photo => photo.path));
          if (cleanupError) message += ` Uploaded photo cleanup also failed: ${cleanupError.message}`;
        } catch (cleanupError) {
          message += ` Uploaded photo cleanup also failed: ${errorMessage(cleanupError)}`;
        }
      }
      setFormError(saved
        ? `The listing was saved, but its returned data could not be displayed: ${message}`
        : `Listing was not saved: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProperty(property: PropertyRecord) {
    if (!window.confirm(`Delete “${property.title}”? This cannot be undone.`)) return;
    setDeletingId(property.id);
    setPropertiesError('');
    setFormNotice('');

    try {
      const { data: deletedRow, error: deleteError } = await getSupabaseClient()
        .from('properties')
        .delete()
        .eq('id', property.id)
        .select('id')
        .maybeSingle();

      if (deleteError) throw deleteError;
      if (!deletedRow) {
        throw new Error('No listing was deleted. It may no longer exist or the current RLS policy did not allow the operation.');
      }

      setProperties(current => current.filter(item => item.id !== property.id));
      if (editingId === property.id) resetPropertyForm();

      const objectPaths = property.image_urls
        .map(uploadedObjectPath)
        .filter((path): path is string => path !== null);
      const unmanagedImageCount = property.image_urls.length - objectPaths.length;
      if (objectPaths.length > 0) {
        try {
          const { error: imageDeleteError } = await getSupabaseClient()
            .storage
            .from(PROPERTY_IMAGE_BUCKET)
            .remove(objectPaths);
          setFormNotice(imageDeleteError
            ? `Listing deleted, but its image files could not all be deleted: ${imageDeleteError.message}`
            : unmanagedImageCount > 0
              ? `Listing deleted with ${objectPaths.length} managed image(s); ${unmanagedImageCount} external or unmanaged image link(s) were left untouched.`
              : 'Listing and its managed image files deleted successfully.');
        } catch (imageDeleteError) {
          setFormNotice(`Listing deleted, but its image files could not all be deleted: ${errorMessage(imageDeleteError)}`);
        }
      } else {
        setFormNotice(unmanagedImageCount > 0
          ? `Listing deleted; ${unmanagedImageCount} external or unmanaged image link(s) were left untouched.`
          : 'Listing deleted successfully.');
      }
    } catch (deleteError) {
      setPropertiesError(`Could not delete listing: ${errorMessage(deleteError)}`);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <main className="admin-page">
        <div className="admin-loading"><LoaderCircle className="admin-spinner" /> Checking administrator access…</div>
      </main>
    );
  }

  if (error && !email) {
    return (
      <main className="admin-page">
        <section className="admin-card admin-access-card">
          <div className="admin-brand-mark"><ShieldCheck size={22} /></div>
          <h1>Admin access unavailable</h1>
          <p className="admin-message admin-error" role="alert">{error}</p>
          <a className="admin-button admin-button-secondary" href="/admin/login">Go to admin login</a>
          <a className="admin-back-link" href="/">Back to Property Deal</a>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page admin-dashboard-page">
      <header className="admin-dashboard-header">
        <a className="admin-dashboard-brand" href="/"><span className="admin-brand-mark"><Building2 size={20} /></span> Property Deal <small>ADMIN</small></a>
        <div className="admin-account">
          <span>{email}</span>
          <button className="admin-button admin-button-secondary" type="button" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? <LoaderCircle className="admin-spinner" size={16} /> : <LogOut size={16} />}
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      <div className="admin-dashboard-content">
        <div className="admin-dashboard-title">
          <div><span className="admin-eyebrow">ADMINISTRATION</span><h1>Property dashboard</h1></div>
          <span className="admin-status-chip"><span /> Authorized admin · Supabase RLS</span>
        </div>

        {error && <p className="admin-message admin-error" role="alert">{error}</p>}
        <section className="admin-notice" role="status">
          <ShieldCheck size={20} />
          <div>
            <strong>Property management is connected to Supabase</strong>
            <p>Property access uses your authenticated session and the existing admin-scoped RLS policies. The image bucket is public, so anyone with an image URL can view those photos; only the authorized admin can upload, update, or delete files under the verified storage policies. Do not upload private or sensitive images.</p>
          </div>
        </section>

        <section className="admin-dashboard-grid">
          <article className="admin-card admin-panel">
            <div className="admin-panel-heading">
              <div><span className="admin-eyebrow">INVENTORY</span><h2>Property listings</h2></div>
              <span className="admin-count">{propertiesLoading ? '…' : properties.length}</span>
            </div>
            <p className="admin-muted">Listings use the verified <code>properties</code> columns. New records default to Pending; only Published listings are visible under the public read policy.</p>
            {propertiesError && <p className="admin-message admin-error" role="alert">{propertiesError}</p>}
            {propertiesLoading
              ? <p className="admin-loading-inline"><LoaderCircle className="admin-spinner" size={16} /> Loading listings…</p>
              : propertiesError
                ? <button className="admin-button admin-button-secondary" type="button" onClick={() => void loadProperties()}>Retry loading listings</button>
                : properties.length === 0
                  ? <p className="admin-muted">No property listings were returned for this admin account.</p>
                  : <ul className="admin-listings-list">
                    {properties.map(property => (
                      <li className="admin-listing-item" key={property.id}>
                        {property.image_urls[0] && <img src={property.image_urls[0]} alt="" loading="lazy" />}
                        <div className="admin-listing-summary">
                          <strong>{property.title}</strong>
                          <span>{property.location} · {property.property_type} · {property.listing_type}</span>
                          <span>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(property.price)} · {property.status}</span>
                        </div>
                        <div className="admin-listing-actions">
                          <button className="admin-button admin-button-secondary" type="button" onClick={() => startEditing(property)} disabled={saving || deletingId !== null} aria-label={`Edit ${property.title}`}>
                            <Pencil size={15} /> Edit
                          </button>
                          <button className="admin-button admin-button-danger" type="button" onClick={() => void handleDeleteProperty(property)} disabled={saving || deletingId !== null} aria-label={`Delete ${property.title}`}>
                            {deletingId === property.id ? <LoaderCircle className="admin-spinner" size={15} /> : <Trash2 size={15} />}
                            {deletingId === property.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>}
            <form className="admin-listing-form" onSubmit={handlePropertySubmit}>
              <fieldset className="admin-placeholder-form" disabled={saving}>
                <legend>{editingId ? 'Edit property' : 'Create property'}</legend>
                <label>Title<input required maxLength={160} value={propertyDraft.title} onChange={event => updatePropertyDraft('title', event.target.value)} placeholder="Property title" /></label>
                <label>Description<textarea maxLength={5000} value={propertyDraft.description} onChange={event => updatePropertyDraft('description', event.target.value)} placeholder="Property description (optional)" rows={3} /></label>
                <div className="admin-field-row">
                  <label>Price<input required type="number" min="0" step="any" value={propertyDraft.price} onChange={event => updatePropertyDraft('price', event.target.value)} placeholder="Price in INR" /></label>
                  <label>Location<input required maxLength={200} value={propertyDraft.location} onChange={event => updatePropertyDraft('location', event.target.value)} placeholder="Locality / sector" /></label>
                </div>
                <div className="admin-field-row">
                  <label>Property type<input required maxLength={100} value={propertyDraft.propertyType} onChange={event => updatePropertyDraft('propertyType', event.target.value)} placeholder="Apartment, villa…" /></label>
                  <label>Sale or rent<select required value={propertyDraft.purpose} onChange={event => updatePropertyDraft('purpose', event.target.value as PropertyDraft['purpose'])}><option value="" disabled>Select purpose</option><option value="sale">Sale</option><option value="rent">Rent</option></select></label>
                </div>
                <div className="admin-field-row admin-field-row-three">
                  <label>Bedrooms<input type="number" min="0" step="1" value={propertyDraft.bedrooms} onChange={event => updatePropertyDraft('bedrooms', event.target.value)} /></label>
                  <label>Bathrooms<input type="number" min="0" step="1" value={propertyDraft.bathrooms} onChange={event => updatePropertyDraft('bathrooms', event.target.value)} /></label>
                  <label>Area (sq ft)<input type="number" min="0" step="any" value={propertyDraft.area} onChange={event => updatePropertyDraft('area', event.target.value)} /></label>
                </div>
                <label>Property photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handlePhotoSelection} aria-describedby="admin-photo-help admin-photo-selection" /></label>
                <small id="admin-photo-help" className="admin-form-hint">JPG, PNG, or WebP; up to {MAX_PROPERTY_PHOTOS} photos total, 5 MiB each. Existing photos are kept when editing.</small>
                <div id="admin-photo-selection" className="admin-selected-files" aria-live="polite">
                  {editingId && (properties.find(property => property.id === editingId)?.image_urls.length ?? 0) > 0
                    && <strong>{properties.find(property => property.id === editingId)?.image_urls.length} existing photo(s) will be kept.</strong>}
                  {selectedPhotos.length > 0
                    ? <><strong>{selectedPhotos.length} new photo(s) selected</strong><ul>{selectedPhotos.map((photo, index) => <li key={`${photo.name}-${index}`}>{photo.name}</li>)}</ul></>
                    : <span>No new photos selected.</span>}
                </div>
                <label>Status<select required value={propertyDraft.publicationStatus} onChange={event => updatePropertyDraft('publicationStatus', event.target.value as PropertyStatus)}><option value="pending">Pending</option><option value="published">Published</option><option value="rejected">Rejected</option></select></label>
                {formError && <p className="admin-message admin-error" role="alert">{formError}</p>}
                {formNotice && <p className="admin-message admin-success" role="status">{formNotice}</p>}
              </fieldset>
              <div className="admin-form-actions">
                <button className="admin-button admin-button-primary" type="submit" disabled={saving || deletingId !== null}>
                  {saving ? <LoaderCircle className="admin-spinner" size={16} /> : editingId ? <Pencil size={16} /> : <Plus size={16} />}
                  {saving ? 'Saving…' : editingId ? 'Update listing' : 'Save listing'}
                </button>
                {editingId && <button className="admin-button admin-button-secondary" type="button" onClick={resetPropertyForm} disabled={saving}><X size={16} /> Cancel edit</button>}
              </div>
              <p className="admin-form-hint">
                Images are uploaded to the public <code>property-images</code> bucket; saved URLs are stored in <code>image_urls</code>. Database and storage errors are shown here.
              </p>
            </form>
          </article>

          <article className="admin-card admin-panel">
            <div className="admin-panel-heading">
              <div><span className="admin-eyebrow">SELLER REVIEW</span><h2>Property submissions</h2></div>
              <span className="admin-count" aria-label={`${submissions.filter(item => item.status === 'pending').length} pending`}>
                {submissionsLoading ? '…' : submissions.filter(item => item.status === 'pending').length}
              </span>
            </div>
            <p className="admin-muted">Pending and incomplete submissions are private. Approval copies verified photos to the public property bucket and publishes the listing in one database transaction.</p>
            {submissionNotice && <p className="admin-message admin-success" role="status">{submissionNotice}</p>}
            {submissionsError && <p className="admin-message admin-error" role="alert">{submissionsError}</p>}
            {submissionsLoading
              ? <p className="admin-loading-inline"><LoaderCircle className="admin-spinner" size={16} /> Loading property submissions…</p>
              : submissionsError && submissions.length === 0
                ? <button className="admin-button admin-button-secondary" type="button" onClick={() => void loadSubmissions()}>Retry loading submissions</button>
                : submissions.length === 0
                  ? <div className="admin-empty-state"><ShieldCheck size={23} /><strong>No property submissions yet</strong><span>New seller submissions will appear here for private review.</span></div>
                  : <ul className="admin-submissions-list">
                    {submissions.map(submission => (
                      <li className="admin-submission-item" key={submission.id}>
                        <div className="admin-submission-heading">
                          <div className="admin-listing-summary">
                            <strong>{submission.title}</strong>
                            <span>{submission.seller_name} · <a href={`tel:${submission.seller_phone}`}>{submission.seller_phone}</a></span>
                            <span>{submission.locality}, {submission.city} · {submission.property_type} · {submission.listing_type}</span>
                            <span>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(submission.expected_price)} · {new Date(submission.created_at).toLocaleString()}</span>
                          </div>
                          <span className={`admin-submission-status status-${submission.status}`}>{submission.status}</span>
                        </div>
                        <div className="admin-listing-actions">
                          <button className="admin-button admin-button-secondary" type="button" onClick={() => void toggleSubmissionDetails(submission)} disabled={processingSubmissionId !== null}>
                            <Eye size={15} /> {selectedSubmissionId === submission.id ? 'Hide details' : 'View details'}
                          </button>
                          {submission.status !== 'approved' && <button
                            className="admin-button admin-button-secondary"
                            type="button"
                            onClick={() => setEditingSubmissionId(current => current === submission.id ? null : submission.id)}
                            disabled={processingSubmissionId !== null}
                          >
                            <Pencil size={15} /> {editingSubmissionId === submission.id ? 'Cancel edit' : 'Edit submission'}
                          </button>}
                          {submission.status === 'pending' && <button className="admin-button admin-button-primary" type="button" onClick={() => void handleApproveSubmission(submission)} disabled={processingSubmissionId !== null}>
                            {processingSubmissionId === submission.id ? <LoaderCircle className="admin-spinner" size={15} /> : <Check size={15} />}
                            {processingSubmissionId === submission.id ? 'Approving…' : 'Approve & publish'}
                          </button>}
                          {(submission.status === 'pending' || submission.status === 'uploading') && <button className="admin-button admin-button-danger" type="button" onClick={() => void handleRejectSubmission(submission)} disabled={processingSubmissionId !== null}>
                            {processingSubmissionId === submission.id ? <LoaderCircle className="admin-spinner" size={15} /> : <X size={15} />}
                            {processingSubmissionId === submission.id ? 'Processing…' : 'Reject'}
                          </button>}
                          <button
                            className="admin-button admin-button-danger"
                            type="button"
                            onClick={() => void handleDeleteSubmission(submission)}
                            disabled={processingSubmissionId !== null}
                          >
                            {processingSubmissionId === submission.id ? <LoaderCircle className="admin-spinner" size={15} /> : <Trash2 size={15} />}
                            Delete submission
                          </button>
                        </div>
                        {editingSubmissionId === submission.id && submission.status !== 'approved' && <form
                          className="admin-submission-edit-form"
                          onSubmit={event => void handleUpdateSubmission(event, submission)}
                        >
                          <label>Owner name<input name="seller_name" required maxLength={120} defaultValue={submission.seller_name} /></label>
                          <label>Phone number<input name="seller_phone" required type="tel" inputMode="tel" maxLength={20} defaultValue={submission.seller_phone} /></label>
                          <label>Email (optional)<input name="seller_email" type="email" maxLength={254} defaultValue={submission.seller_email ?? ''} /></label>
                          <label>Property title<input name="title" required maxLength={160} defaultValue={submission.title} /></label>
                          <label>Property type<input name="property_type" required maxLength={100} defaultValue={submission.property_type} /></label>
                          <label>Listing type<select name="listing_type" required defaultValue={submission.listing_type}><option value="sale">Sale</option><option value="rent">Rent</option></select></label>
                          <label>Expected price / rent (₹)<input name="expected_price" required type="number" min="0" step="any" defaultValue={submission.expected_price} /></label>
                          <label>City<input name="city" required maxLength={120} defaultValue={submission.city} /></label>
                          <label>Locality<input name="locality" required maxLength={160} defaultValue={submission.locality} /></label>
                          <label>Address (optional)<input name="address" maxLength={300} defaultValue={submission.address ?? ''} /></label>
                          <label>Bedrooms<input name="bedrooms" type="number" min="0" step="1" defaultValue={submission.bedrooms ?? ''} /></label>
                          <label>Bathrooms<input name="bathrooms" type="number" min="0" step="1" defaultValue={submission.bathrooms ?? ''} /></label>
                          <label>Area (sq ft)<input name="area_sqft" type="number" min="0" step="any" defaultValue={submission.area_sqft ?? ''} /></label>
                          <label className="admin-submission-edit-wide">Description<textarea name="description" rows={4} maxLength={5000} defaultValue={submission.description ?? ''} /></label>
                          <div className="admin-form-actions admin-submission-edit-wide">
                            <button className="admin-button admin-button-primary" type="submit" disabled={processingSubmissionId !== null}>
                              {processingSubmissionId === submission.id ? <LoaderCircle className="admin-spinner" size={15} /> : <Check size={15} />}
                              Save submission
                            </button>
                            <button className="admin-button admin-button-secondary" type="button" onClick={() => setEditingSubmissionId(null)} disabled={processingSubmissionId !== null}>
                              Cancel
                            </button>
                          </div>
                        </form>}
                        {selectedSubmissionId === submission.id && <div className="admin-submission-details">
                          <dl>
                            <div><dt>Contact</dt><dd>{submission.seller_name} · {submission.seller_phone}{submission.seller_email ? ` · ${submission.seller_email}` : ''}</dd></div>
                            <div><dt>Address</dt><dd>{[submission.address, submission.locality, submission.city].filter(Boolean).join(', ')}</dd></div>
                            <div><dt>Property</dt><dd>{submission.title} · {submission.description || 'No description supplied'} · {submission.bedrooms ?? '—'} bedroom(s), {submission.bathrooms ?? '—'} bathroom(s), {submission.area_sqft ?? '—'} sq ft</dd></div>
                            <div><dt>Photos</dt><dd>{submissionPhotos[submission.id]?.length ?? 0} of {submission.expected_photo_count} uploaded · private until approval</dd></div>
                            {submission.property_id && <div><dt>Published property</dt><dd>{submission.property_id}</dd></div>}
                          </dl>
                          {photoLoadingId === submission.id
                            ? <p className="admin-loading-inline"><LoaderCircle className="admin-spinner" size={16} /> Loading secure photo previews…</p>
                            : submissionPhotos[submission.id]?.length
                              ? <div className="admin-submission-photos">{submissionPhotos[submission.id].map(photo => <img key={photo.path} src={photo.url} alt={`Submitted photo for ${submission.title}`} loading="lazy" />)}</div>
                              : <p className="admin-muted">No photos are available for preview.</p>}
                          {submission.status === 'uploading' && <p className="admin-message admin-error">The public upload did not complete, so this submission cannot be approved. Contact the seller if needed, then reject it to remove any uploaded private photos.</p>}
                        </div>}
                      </li>
                    ))}
                  </ul>}
          </article>
          <article className="admin-card admin-panel admin-inquiries-panel">
            <div className="admin-panel-heading">
              <div><span className="admin-eyebrow">CUSTOMER ENQUIRIES</span><h2>Property inquiries</h2></div>
              <span className="admin-count">{inquiriesLoading ? '…' : inquiries.length}</span>
            </div>
            <p className="admin-muted">Inquiries submitted through the public property popup. Contact visitors directly using the details they provided.</p>
            {inquiriesError && <p className="admin-message admin-error" role="alert">{inquiriesError}</p>}
            {inquiriesLoading
              ? <p className="admin-loading-inline"><LoaderCircle className="admin-spinner" size={16} /> Loading property inquiries…</p>
              : inquiriesError && inquiries.length === 0
                ? <button className="admin-button admin-button-secondary" type="button" onClick={() => void loadInquiries()}>Retry loading inquiries</button>
                : inquiries.length === 0
                  ? <div className="admin-empty-state"><MessageCircle size={23} /><strong>No inquiries yet</strong><span>New property inquiries will appear here after the database migration is applied.</span></div>
                  : <ul className="admin-inquiries-list">
                    {inquiries.map(inquiry => (
                      <li className="admin-inquiry-item" key={inquiry.id}>
                        <div className="admin-inquiry-heading">
                          <div className="admin-listing-summary">
                            <strong>{inquiry.full_name} <span>· {inquiry.inquiry_type.toUpperCase()}</span></strong>
                            <span><a href={`tel:${inquiry.mobile_number}`}>{inquiry.mobile_number}</a>{inquiry.email_address ? <> · <a href={`mailto:${inquiry.email_address}`}>{inquiry.email_address}</a></> : null}</span>
                            <span>{[inquiry.preferred_location, inquiry.property_type, inquiry.budget].filter(Boolean).join(' · ') || 'No property preferences supplied'}</span>
                            <span>{new Date(inquiry.created_at).toLocaleString()}</span>
                          </div>
                          <span className={`admin-submission-status status-${inquiry.status}`}>{inquiry.status}</span>
                        </div>
                        {inquiry.additional_message && <p className="admin-inquiry-message">{inquiry.additional_message}</p>}
                      </li>
                    ))}
                  </ul>}
          </article>
        </section>
      </div>
    </main>
  );
}

export default function AdminRoutes() {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === '/admin/login' ? <AdminLogin /> : <AdminDashboard />;
}
