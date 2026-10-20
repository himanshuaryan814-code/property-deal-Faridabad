import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AdminRoutes from './admin/AdminRoutes';
import InitialLoader from './InitialLoader';
import PropertyInquiryPopup from './PropertyInquiryPopup';
import './styles.css';
import './hero.css';
import './footer.css';
import './header.css';
import './trust-intro.css';
import './preloader.css';
import './property-search.css';
import './property-inquiry.css';

const path = window.location.pathname.replace(/\/+$/, '') || '/';
const isAdmin = path === '/admin' || path === '/admin/login';
const page = isAdmin ? <AdminRoutes /> : <App />;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{page}{!isAdmin && <PropertyInquiryPopup />}<InitialLoader /></React.StrictMode>,
);