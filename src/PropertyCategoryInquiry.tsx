import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { openWhatsAppInquiry } from './utils/whatsapp';

export type CategoryInquiryType = 'buy' | 'rent' | 'sell' | 'commercial' | 'plots/land' | 'projects';

type Props = {
  inquiryType: CategoryInquiryType;
  category: string;
  propertyType: string;
};

type InquiryDraft = {
  fullName: string;
  mobileNumber: string;
  emailAddress: string;
  preferredLocation: string;
  propertyType: string;
  budget: string;
  message: string;
};

const propertyTypeOptions: Record<CategoryInquiryType, string[]> = {
  buy: ['Flats / Apartments', 'Independent Houses', 'Villas', 'Builder Floors', 'Residential Plots', 'Farmhouses', 'Other'],
  rent: ['Flats / Apartments', 'Independent Houses', 'Villas', 'Builder Floors', 'PG / Paying Guest', 'Shared Accommodation', 'Farmhouses', 'Other'],
  sell: ['Flat / Apartment', 'Independent House', 'Villa', 'Builder Floor', 'Plot / Land', 'Commercial Property', 'Other'],
  commercial: ['Office Spaces', 'Retail Shops', 'Showrooms', 'Commercial Buildings', 'Commercial Plots', 'Warehouses', 'Industrial Properties', 'Other'],
  'plots/land': ['Residential Plots', 'Commercial Plots', 'Agricultural Land', 'Farm Land', 'Industrial Land', 'Other'],
  projects: ['Apartments', 'Builder Floors', 'Villas', 'Residential Plots', 'Commercial Projects', 'Other'],
};

const categoryTitles: Record<CategoryInquiryType, string> = {
  buy: 'Buy a property',
  rent: 'Rent a property',
  sell: 'Sell or list your property',
  commercial: 'Commercial property inquiry',
  'plots/land': 'Plots & land inquiry',
  projects: 'Projects inquiry',
};

const categoryIntroductions: Record<CategoryInquiryType, string> = {
  buy: 'Tell us what you are looking for and a local property advisor will help you find the right fit.',
  rent: 'Share your rental requirements and our team will help you find a suitable place.',
  sell: 'Request personal guidance on selling or listing your property with Property Deal.',
  commercial: 'Tell us about your commercial property requirements and our team will help you explore suitable options.',
  'plots/land': 'Share your land or plot requirements and we will help you explore the available options.',
  projects: 'Tell us what you are looking for in a new project and our team will share current availability.',
};

const inquiryLabel: Record<CategoryInquiryType, string> = {
  buy: 'Buy',
  rent: 'Rent',
  sell: 'Sell',
  commercial: 'Commercial',
  'plots/land': 'Plots/Land',
  projects: 'Projects',
};

const emptyDraft: InquiryDraft = {
  fullName: '',
  mobileNumber: '',
  emailAddress: '',
  preferredLocation: '',
  propertyType: '',
  budget: '',
  message: '',
};

export default function PropertyCategoryInquiry({ inquiryType, category, propertyType }: Props) {
  const initialPropertyType = propertyType === 'All types' ? '' : propertyType;
  const [draft, setDraft] = useState<InquiryDraft>(() => ({
    ...emptyDraft,
    propertyType: initialPropertyType,
  }));
  const [error, setError] = useState('');

  const typeOptions = propertyTypeOptions[inquiryType];
  const selectedPropertyType = typeOptions.find(option => option.toLowerCase() === draft.propertyType.toLowerCase());
  const canUseSelectedType = selectedPropertyType !== undefined;

  function update<K extends keyof InquiryDraft>(field: K, value: InquiryDraft[K]) {
    setDraft(current => ({ ...current, [field]: value }));
    setError('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.fullName.trim() || !draft.preferredLocation.trim() || !draft.propertyType.trim()) {
      setError('Complete all required fields before submitting your inquiry.');
      return;
    }

    const phone = draft.mobileNumber.trim();
    const digits = phone.replace(/\D/g, '');
    if (!/^\+?[0-9()\s-]{8,20}$/.test(phone) || digits.length < 8 || digits.length > 15) {
      setError('Enter a valid phone number with 8 to 15 digits.');
      return;
    }

    setError('');
    openWhatsAppInquiry({
      category: inquiryLabel[inquiryType],
      fullName: draft.fullName,
      phoneNumber: phone,
      email: draft.emailAddress,
      location: draft.preferredLocation,
      propertyType: draft.propertyType,
      budget: draft.budget,
      requirements: draft.message,
    });
  }

  return (
    <section className="category-inquiry" aria-labelledby="category-inquiry-title">
      <div className="category-inquiry-intro">
        <span className="category-inquiry-eyebrow"><i /> PROPERTY INQUIRY · {category.toUpperCase()}</span>
        <h2 id="category-inquiry-title">{categoryTitles[inquiryType]}</h2>
        <p>{categoryIntroductions[inquiryType]}</p>
      </div>
      <form className="category-inquiry-form" onSubmit={handleSubmit}>
        <div className="category-inquiry-form-fields">
          <label>Full Name<input required maxLength={120} autoComplete="name" value={draft.fullName} onChange={event => update('fullName', event.target.value)} /></label>
          <label>Phone Number<input required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={draft.mobileNumber} onChange={event => update('mobileNumber', event.target.value)} placeholder="+91 98765 43210" /></label>
          <label>Email Address <small>Optional</small><input type="email" maxLength={254} autoComplete="email" value={draft.emailAddress} onChange={event => update('emailAddress', event.target.value)} /></label>
          <label>Property Location<input required maxLength={160} value={draft.preferredLocation} onChange={event => update('preferredLocation', event.target.value)} placeholder="City, sector or locality" /></label>
          <label>Property Type<select required value={canUseSelectedType ? selectedPropertyType : ''} onChange={event => update('propertyType', event.target.value)}>
            <option value="">Select property type</option>
            {!canUseSelectedType && propertyType !== 'All types' && <option value={propertyType}>{propertyType}</option>}
            {typeOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select></label>
          <label>Inquiry Type<select required value={inquiryType} disabled>
            <option value={inquiryType}>{inquiryLabel[inquiryType]}</option>
          </select></label>
          <label>Budget or Expected Price<input maxLength={100} value={draft.budget} onChange={event => update('budget', event.target.value)} placeholder="e.g. ₹80 lakh or ₹20,000/month" /></label>
          <label className="category-inquiry-form-wide">Additional Requirements<textarea rows={2} maxLength={2000} value={draft.message} onChange={event => update('message', event.target.value)} placeholder="Share your requirements or any helpful details" /></label>
        </div>
        {error && <p className="category-inquiry-error" role="alert">{error}</p>}
        <div className="category-inquiry-submit-row">
          <button className="category-inquiry-submit" type="submit">
            Submit Inquiry
            <ArrowRight size={15} />
          </button>
          <small>WhatsApp will open with your details. Review and send the message there.</small>
        </div>
      </form>
    </section>
  );
}
