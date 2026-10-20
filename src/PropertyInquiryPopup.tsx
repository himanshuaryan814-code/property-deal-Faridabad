import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { LoaderCircle, MessageCircle, X } from 'lucide-react';
import { getSupabaseClient } from './lib/supabase';
import { whatsapp } from './utils/whatsapp';

type InquiryType = 'buy' | 'rent' | 'sell';
type InquiryForm = {
  fullName: string;
  mobileNumber: string;
  emailAddress: string;
  preferredLocation: string;
  propertyType: string;
  budget: string;
  message: string;
};

const SESSION_KEY = 'property-deal-inquiry-popup-shown';
const PROPERTY_TYPES: Record<InquiryType, string[]> = {
  buy: ['Flats / Apartments', 'Independent House', 'Villa', 'Builder Floor', 'Residential Plot', 'Other'],
  rent: ['Flats / Apartments', 'Independent House', 'Villa', 'Builder Floor', 'PG / Paying Guest', 'Other'],
  sell: ['Flat / Apartment', 'Independent House', 'Villa', 'Builder Floor', 'Plot / Land', 'Commercial Property', 'Other'],
};
const TYPE_LABELS: Record<InquiryType, string> = {
  buy: 'Buy a Property',
  rent: 'Rent a Property',
  sell: 'Sell a Property',
};
const EMPTY_FORM: InquiryForm = {
  fullName: '',
  mobileNumber: '',
  emailAddress: '',
  preferredLocation: '',
  propertyType: '',
  budget: '',
  message: '',
};

function resetSessionFlagForDevelopment(): boolean {
  if (!import.meta.env.DEV) return false;

  const url = new URL(window.location.href);
  if (url.searchParams.get('resetInquiryPopup') !== '1') return false;

  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error('Could not reset the inquiry popup session state.', error);
    return false;
  }

  url.searchParams.delete('resetInquiryPopup');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}

const resetSessionForDevelopment = resetSessionFlagForDevelopment();

function readSessionFlag(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === 'true';
  } catch (error) {
    console.error('Could not read the inquiry popup session state.', error);
    return false;
  }
}

function markSessionFlag(): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, 'true');
  } catch (error) {
    console.error('Could not save the inquiry popup session state.', error);
  }
}

function logPopupDebug(message: string, details?: unknown): void {
  if (import.meta.env.DEV) {
    console.debug(`[PropertyInquiryPopup] ${message}`, details ?? '');
  }
}

function buildWhatsAppMessage(type: InquiryType, form: InquiryForm): string {
  const lines = [
    'Hello Property Deal, I have a property inquiry.',
    '',
    `Inquiry Type: ${type[0].toUpperCase()}${type.slice(1)}`,
    `Full Name: ${form.fullName.trim()}`,
    `Mobile Number: ${form.mobileNumber.trim()}`,
  ];
  if (form.emailAddress.trim()) lines.push(`Email Address: ${form.emailAddress.trim()}`);
  if (form.preferredLocation.trim()) lines.push(`Preferred Location: ${form.preferredLocation.trim()}`);
  if (form.propertyType) lines.push(`Property Type: ${form.propertyType}`);
  if (form.budget.trim()) lines.push(`Budget / Expected Price: ${form.budget.trim()}`);
  if (form.message.trim()) lines.push(`Additional Message: ${form.message.trim()}`);
  lines.push('', 'Please contact me regarding this inquiry.');
  return lines.join('\n');
}

export default function PropertyInquiryPopup() {
  const [visible, setVisible] = useState(false);
  const [inquiryType, setInquiryType] = useState<InquiryType>('buy');
  const [form, setForm] = useState<InquiryForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [databaseMessage, setDatabaseMessage] = useState('');
  const [prepared, setPrepared] = useState(false);
  const [whatsAppUrl, setWhatsAppUrl] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const popupShownRef = useRef<boolean | null>(null);
  const submissionStartedRef = useRef(false);
  const mountedRef = useRef(false);
  if (popupShownRef.current === null) {
    popupShownRef.current = resetSessionForDevelopment ? false : readSessionFlag();
  }

  useEffect(() => {
    mountedRef.current = true;
    logPopupDebug('component mounted', {
      pathname: window.location.pathname,
      sessionFlag: readSessionFlag(),
      resetApplied: resetSessionForDevelopment,
    });

    const searchSection = document.getElementById('search');
    if (!searchSection) {
      logPopupDebug('search section not found; observer was not attached');
      return () => {
        mountedRef.current = false;
        logPopupDebug('component unmounted');
      };
    }

    const heroSection = document.querySelector('main#home > .hero');
    logPopupDebug('observing search section', {
      target: searchSection,
      targetId: searchSection.id,
      targetTag: searchSection.tagName,
      directHomepageSection: searchSection.parentElement?.matches('main#home') ?? false,
      followsHero: heroSection?.nextElementSibling === searchSection,
      sessionBlocked: popupShownRef.current,
      scrollY: window.scrollY,
      targetRect: searchSection.getBoundingClientRect().toJSON(),
      viewportHeight: window.innerHeight,
    });

    if (popupShownRef.current) {
      logPopupDebug('sessionStorage blocks popup for this browser session');
      return () => {
        mountedRef.current = false;
        logPopupDebug('component unmounted');
      };
    }

    let reachedSearchWhileScrollingDown = false;
    let previousScrollY = window.scrollY;
    let observer: IntersectionObserver | null = null;

    const sectionVisibility = () => {
      const rect = searchSection.getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
        intersectsViewport: rect.bottom > 0 && rect.top < window.innerHeight,
        triggerThresholdPassed: rect.top < window.innerHeight,
      };
    };

    const maybeOpen = () => {
      if (popupShownRef.current || !reachedSearchWhileScrollingDown) return;
      const visibility = sectionVisibility();
      if (!visibility.triggerThresholdPassed) return;
      popupShownRef.current = true;
      markSessionFlag();
      logPopupDebug('trigger fired; opening popup', visibility);
      setVisible(true);
    };

    const onScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > previousScrollY) {
        const visibility = sectionVisibility();
        logPopupDebug('downward scroll checked', visibility);
        if (visibility.triggerThresholdPassed) {
          reachedSearchWhileScrollingDown = true;
        }
      }
      previousScrollY = currentScrollY;
      maybeOpen();
    };

    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        logPopupDebug('IntersectionObserver callback', {
          isIntersecting: entry.isIntersecting,
          intersectionRatio: entry.intersectionRatio,
          boundingClientRect: entry.boundingClientRect.toJSON(),
          rootBounds: entry.rootBounds?.toJSON(),
          scrollY: window.scrollY,
          reachedSearchWhileScrollingDown,
        });
      }
      maybeOpen();
    }, { threshold: 0.01, rootMargin: '0px' });
    observer.observe(searchSection);
    logPopupDebug('IntersectionObserver attached', { threshold: 0.01, rootMargin: '0px' });

    const initialVisibility = sectionVisibility();
    if (window.scrollY > 0 && initialVisibility.intersectsViewport && initialVisibility.triggerThresholdPassed) {
      reachedSearchWhileScrollingDown = true;
      logPopupDebug('initialization found an already-scrolled visible search section', initialVisibility);
      maybeOpen();
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', onScroll);
      mountedRef.current = false;
      logPopupDebug('observer and scroll listeners cleaned up');
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      logPopupDebug(`popup visible state changed to ${visible}`, { mounted: mountedRef.current });
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setVisible(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>('.property-inquiry-dialog');
      const focusable = dialog?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [visible]);

  function updateForm(field: keyof InquiryForm, value: string) {
    setForm(current => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionStartedRef.current || loading) return;
    setErrorMessage('');

    if (!form.fullName.trim()) {
      setErrorMessage('Enter your full name.');
      return;
    }

    const digits = form.mobileNumber.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      setErrorMessage('Enter a valid mobile number with 8 to 15 digits.');
      return;
    }

    submissionStartedRef.current = true;
    setLoading(true);
    const url = whatsapp(buildWhatsAppMessage(inquiryType, form));
    setWhatsAppUrl(url);
    setPrepared(true);
    window.open(url, '_blank', 'noopener,noreferrer');

    try {
      const { data, error } = await getSupabaseClient().rpc('submit_property_inquiry', {
        p_inquiry_type: inquiryType,
        p_full_name: form.fullName.trim(),
        p_mobile_number: form.mobileNumber.trim(),
        p_email_address: form.emailAddress.trim() || null,
        p_preferred_location: form.preferredLocation.trim() || null,
        p_property_type: form.propertyType || null,
        p_budget: form.budget.trim() || null,
        p_additional_message: form.message.trim() || null,
      });
      if (error) throw error;
      if (typeof data !== 'string' || !data) {
        throw new Error('The database did not return a submission confirmation.');
      }
      setDatabaseMessage('A copy of your inquiry was saved to the website.');
    } catch (error) {
      console.error('Could not save the property inquiry to Supabase.', error);
      setDatabaseMessage(
        'WhatsApp is ready, but we could not save a copy of your inquiry to the website. Your inquiry has not been sent yet—press Send in WhatsApp.',
      );
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;

  return (
    <div
      className="property-inquiry-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) setVisible(false);
      }}
    >
      <section
        className="property-inquiry-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="property-inquiry-title"
        aria-describedby="property-inquiry-description"
      >
        <button
          ref={closeButtonRef}
          className="property-inquiry-close"
          type="button"
          aria-label="Close property inquiry"
          onClick={() => setVisible(false)}
        >
          <X size={19} />
        </button>
        {prepared ? (
          <div className="property-inquiry-success">
            <span className="property-inquiry-success-mark"><MessageCircle size={22} /></span>
            <span className="property-inquiry-eyebrow">PROPERTY DEAL</span>
            <h2 id="property-inquiry-title">Your inquiry is ready to send.</h2>
            <p role="status">Your message has been prepared in WhatsApp. Review the details and press Send there to contact Property Deal.</p>
            <a className="property-inquiry-submit" href={whatsAppUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={17} /> Send Inquiry on WhatsApp
            </a>
            {databaseMessage && <p className={databaseMessage.startsWith('WhatsApp is ready') ? 'property-inquiry-error' : ''} role={databaseMessage.startsWith('WhatsApp is ready') ? 'alert' : 'status'}>{databaseMessage}</p>}
            <small>A website cannot send the message for you. WhatsApp must be open and you must press Send.</small>
            <button className="property-inquiry-continue" type="button" onClick={() => setVisible(false)}>
              Close and continue browsing
            </button>
          </div>
        ) : (
          <>
            <div className="property-inquiry-brand">
              <img src="/—Pngtree—real%20estate%20logo_4103471.png" alt="Property Deal logo" />
              <span>PROPERTY DEAL<small>REAL ESTATE · FARIDABAD</small></span>
            </div>
            <h2 id="property-inquiry-title">Find Your Perfect Property</h2>
            <p id="property-inquiry-description" className="property-inquiry-intro">
              Tell us what you're looking for, and our team will help you find the right property.
            </p>
            <form onSubmit={event => void handleSubmit(event)}>
              <fieldset className="property-inquiry-types" disabled={loading}>
                <legend>What are you looking for?</legend>
                {(Object.keys(TYPE_LABELS) as InquiryType[]).map(type => (
                  <button
                    className={inquiryType === type ? 'selected' : ''}
                    key={type}
                    type="button"
                    aria-pressed={inquiryType === type}
                    onClick={() => {
                      setInquiryType(type);
                      updateForm('propertyType', '');
                    }}
                  >
                    {TYPE_LABELS[type]}
                  </button>
                ))}
              </fieldset>
              <div className="property-inquiry-fields">
                <label>
                  <span className="property-inquiry-label">Full Name <em>*</em></span>
                  <input required maxLength={120} autoComplete="name" value={form.fullName} onChange={event => updateForm('fullName', event.target.value)} />
                </label>
                <label>
                  <span className="property-inquiry-label">Mobile Number <em>*</em></span>
                  <input required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={form.mobileNumber} onChange={event => updateForm('mobileNumber', event.target.value)} placeholder="+91 98765 43210" />
                </label>
                <label>
                  <span className="property-inquiry-label">Email Address <small>Optional</small></span>
                  <input type="email" maxLength={254} autoComplete="email" value={form.emailAddress} onChange={event => updateForm('emailAddress', event.target.value)} />
                </label>
                <label>
                  <span className="property-inquiry-label">Preferred Location <small>Optional</small></span>
                  <input maxLength={160} value={form.preferredLocation} onChange={event => updateForm('preferredLocation', event.target.value)} placeholder="Sector or locality" />
                </label>
                <label>
                  <span className="property-inquiry-label">Property Type <small>Optional</small></span>
                  <select value={form.propertyType} onChange={event => updateForm('propertyType', event.target.value)}>
                    <option value="">Select property type</option>
                    {PROPERTY_TYPES[inquiryType].map(option => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  <span className="property-inquiry-label">Budget or Expected Price <small>Optional</small></span>
                  <input maxLength={100} value={form.budget} onChange={event => updateForm('budget', event.target.value)} placeholder="e.g. ₹80 lakh" />
                </label>
                <label className="property-inquiry-message">
                  <span className="property-inquiry-label">Additional Message <small>Optional</small></span>
                  <textarea rows={2} maxLength={2000} value={form.message} onChange={event => updateForm('message', event.target.value)} />
                </label>
              </div>
              {errorMessage && <p className="property-inquiry-error" role="alert">{errorMessage}</p>}
              <button className="property-inquiry-submit" type="submit" disabled={loading}>
                {loading ? <LoaderCircle className="property-inquiry-spinner" size={17} /> : null}
                {loading ? 'Submitting inquiry…' : 'Submit Inquiry'}
              </button>
              <small className="property-inquiry-privacy">Your details will be used only to respond to this property inquiry.</small>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
