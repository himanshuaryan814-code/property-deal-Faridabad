# Property Deal — Real Estate Website

A responsive React + Vite + TypeScript website for Property Deal, Faridabad. Includes a centered responsive wordmark, published Supabase property search/cards and detail/gallery modal, visit-request WhatsApp handoff, private seller-submission and admin-approval workflow, EMI calculator, FAQ accordion, contact CTAs, and responsive layouts.

## Important before launch

- The public property inventory is loaded from `public.properties` using the published-status policy. Confirm listing details and availability with the business before publishing them.
- Customer testimonials are deliberately not fabricated. Replace the preview with authentic, permission-approved reviews.
- Google Maps link is a directions/search link based on the supplied location reference; confirm the exact address/pin before publishing.
- Visit requests open WhatsApp with a prefilled message for the visitor to review and send. Property submissions are stored privately in Supabase only after the seller-submission migration described below has been reviewed and applied.
- Images use remote Unsplash image URLs. Replace with appropriately licensed owner-provided or licensed images for production and consider downloading/optimizing assets locally.
- Confirm the supplied phone, email, address, Google rating and experience claims before publishing.

## Requirements

Node.js 20+ recommended.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite.

## Production build

```bash
npm run build
npm run preview
```

The generated site is in `dist/`.

## Push to GitHub

Create an empty repository on GitHub, then run these commands from this folder:

```bash
git init
git add .
git commit -m "Build Property Deal website"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the remote URL with your repository URL. Do not commit credentials or private customer information.

## Deploy to Vercel

1. Push the repository to GitHub.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Framework preset: **Vite**. Build command: `npm run build`; output directory: `dist`.
4. Deploy. `vercel.json` provides an SPA rewrite for deep links.
5. Replace `YOUR-DOMAIN.example` in `public/robots.txt` and `public/sitemap.xml` with the real domain. Set a canonical URL and production Open Graph metadata when the domain is known.

### Supabase setup

The admin dashboard uses the existing Supabase client to load and manage property listings, including photo uploads and seller submission review. Seller submission review requires the separately documented migration below; this project does not apply migrations automatically.

1. In the Supabase Dashboard, open your project and copy its **Project URL** from **Project Settings → API** (or the project's **Connect** panel).
2. Copy the **publishable key** from **Project Settings → API Keys**. A legacy `anon` key can also be used. These are public client keys; never use a `service_role` or secret key in this frontend.
3. Copy `.env.example` to `.env.local` in the project root and replace the two placeholder values:

   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
   ```

4. Restart `npm run dev` after changing local environment variables.
5. To inspect the target database before deployment or schema changes, open **Supabase Dashboard → SQL Editor**, run the read-only queries from `supabase/inspect-existing-schema.sql`, and verify the columns, constraints, grants, RLS/storage policies, and bucket settings. Never share keys or customer/property records.
6. In Vercel, open the project's **Settings → Environment Variables** and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the appropriate Development, Preview, and Production environments. Redeploy after saving them.

The anon/publishable key is intended to be exposed in the browser; database and storage access must be enforced by RLS and storage policies. Do not put database passwords or `service_role`/secret keys in `VITE_*` variables. Do not create admin users through this site: create or invite the authorized user through Supabase Auth.

### Category property inquiries

The Buy, Rent, Sell, Commercial, and Plots/Land category inquiry forms save through the existing `submit_property_inquiry` RPC and appear in the authenticated admin dashboard's **Property inquiries** list. After reviewing `supabase/migrations/20261021_category_property_inquiry_types.sql`, run it in the Supabase SQL Editor after `20261021_property_inquiries.sql` so the existing RLS-protected inquiry table and RPC accept Commercial and Plots/Land categories. This migration extends the existing table; it does not create a second inquiry table or change the admin-only read policy. The website reports success only when the RPC returns a saved inquiry ID.

### Secure seller submissions

The seller form calls Supabase RPCs to create a private `uploading` submission, uploads validated JPG/PNG/WebP images to the **private** `property-submission-uploads` bucket, then asks the database to mark it `pending` only after the expected photo count is present. A failed photo upload remains private and appears in the admin queue as incomplete; it is not reported as a successful submission. Public visitors cannot read, update, approve, or publish submissions, and cannot write to `properties`.

Before making this available:

1. Run `supabase/inspect-existing-schema.sql` in the Supabase SQL Editor. Inspect any existing `public.property_submissions` table and private bucket, all anonymous `storage.objects` policies, and authenticated storage policies. Storage policies apply across buckets.
2. For the missing-table/schema-cache error, review `supabase/migrations/20261020_create_property_submissions_table.sql`. It creates and validates the exact table schema and admin-only SELECT policy used by the dashboard, without dropping a table or changing `properties`.
3. In **Supabase Dashboard → SQL Editor**, paste and run that migration. This is a manual action; neither the website nor build runs it. It keeps RLS enabled and issues a PostgREST schema-cache reload notification. The full private-photo and approval RPC workflow is defined in `supabase/migrations/20261019_property_submissions_schema_cache_fix.sql`; if those RPCs and the private upload bucket are not already installed, review and apply that workflow migration as well. Both scripts support the same table schema; do not run the older non-idempotent `20261018_property_submission_workflow.sql` after the table exists.
4. After the table and workflow migrations are installed, review and apply `supabase/migrations/20261021_property_submission_admin_actions.sql`. It adds administrator-only RPCs for editing and deleting submissions; the browser does not receive direct table write permissions. Deleting a submission also removes its private uploaded photos through the existing admin-only storage access. Deleting an already-approved submission does not delete its published property; edit that listing in the property listings panel.
5. Verify the table and columns by running:

   ```sql
   select column_name, data_type, udt_name, is_nullable, column_default
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'property_submissions'
   order by ordinal_position;
   ```

   Verify its policies with:

   ```sql
   select policyname, roles, cmd, qual, with_check
   from pg_policies
   where schemaname = 'public'
     and tablename = 'property_submissions'
   order by policyname;
   ```

   The table should contain 22 columns, RLS should be enabled, and the only direct table policy should be authenticated-admin SELECT. Public create/complete and admin approve/reject go through their respective RPCs.
6. Confirm the authorized admin account still matches `a9906177-2107-4185-81ae-1631a891ed22` and retains the existing `properties` and `property-images` access. Do not add a service-role key to the frontend.
7. Before production use, consider CAPTCHA/rate limiting for anonymous submissions. The current migration validates fields and restricts private object paths/types/sizes, but public submission endpoints can still receive spam.

For property listings, the dashboard maps to `properties.id`, `title`, `description`, `listing_type`, `property_type`, `price`, `location`, `bedrooms`, `bathrooms`, `area_sqft`, `image_urls`, and `status`; database-generated timestamps and nullable contact/submission fields are left to their defaults unless supplied by the database operation. The configured policies must continue to restrict listing mutations and storage writes to the authorized administrator UUID. The `property-images` bucket is public: anyone with an image URL can view its contents. Do not upload sensitive images.

## Features / limitations

- The public property page loads rows from `public.properties` with `status = 'published'`; location, type, budget, bedrooms and text search filter that live result set.
- Public property photos use valid HTTP(S) URLs from `image_urls` and fall back to a styled placeholder when there is no usable or loadable image.
- Property detail modal has next/previous gallery navigation.
- EMI calculator uses the standard reducing-balance formula and supports zero interest.
- Seller property submissions collect contact/property details and private photos for authenticated admin review. They stay out of the public inventory until approved. Visit requests still hand off to WhatsApp and are not automatically booked.
- The admin dashboard loads, creates, edits, and deletes Supabase property listings and uploads JPG, PNG, and WebP photos to the existing public image bucket. With the seller migrations applied, admins can securely preview private submission photos, edit or delete submissions, approve and publish a listing, or reject it.
- Favourites are local UI state only and are not persisted.
- No real-time inventory, CMS, CRM, booking calendar or Google reviews integration is connected.

### End-to-end seller workflow test

After applying the reviewed migration and deploying the frontend with the public Supabase URL/key:

1. Open the public site and submit a test property with valid contact/location fields and one small JPG, PNG, or WebP image.
2. Confirm the form displays a submission reference and the row has `status = 'pending'` in `property_submissions`. Confirm its image object is in the private `property-submission-uploads` bucket and cannot be opened as a public URL.
3. Sign in at `/admin` as the authorized admin. Confirm the new submission, seller details, and signed private photo preview appear in **Property submissions**.
4. Click **Approve & publish**. Confirm the admin reports a published property ID; the submission becomes `approved`, references that property, and its photos are copied into `property-images`.
5. Refresh the public site. Confirm the property appears in published listings with its image. Confirm the original private uploads are removed after approval when storage cleanup succeeds.
6. Submit another test record and click **Reject**. Confirm it becomes `rejected`, is not inserted into public inventory, and is absent from public listings.

Build success does not verify that a Supabase migration has been applied or that the live project's RLS/storage policies behave as intended.
