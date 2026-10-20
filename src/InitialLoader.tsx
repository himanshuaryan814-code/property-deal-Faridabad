import { useEffect, useState } from 'react';

const logoUrl = '/—Pngtree—real%20estate%20logo_4103471.png';

export default function InitialLoader() {
  const [logoReady, setLogoReady] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const logo = new Image();

    const showLoader = () => setLogoReady(true);
    logo.onload = showLoader;
    logo.onerror = () => {
      console.error(`Unable to load the Property Deal logo at ${logoUrl}.`);
      showLoader();
    };
    logo.src = logoUrl;

    return () => {
      logo.onload = null;
      logo.onerror = null;
    };
  }, []);

  useEffect(() => {
    if (!logoReady) return;

    const exitTimer = window.setTimeout(() => setExiting(true), 1650);
    const hideTimer = window.setTimeout(() => setHidden(true), 2050);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(hideTimer);
    };
  }, [logoReady]);

  if (hidden) return null;

  return (
    <div
      className={`initial-loader${exiting ? ' is-exiting' : ''}`}
      role="status"
      aria-label="Loading Property Deal"
    >
      <div className={`initial-loader-content${logoReady ? ' is-ready' : ''}`}>
        <img src={logoUrl} alt="Property Deal Logo" />
        <strong>Property Deal</strong>
        <span>REAL ESTATE · FARIDABAD</span>
        <div className="loader-line" aria-hidden="true"><i /></div>
      </div>
    </div>
  );
}
