import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AdminRoutes from './admin/AdminRoutes';
import InitialLoader from './InitialLoader';
import './styles.css';
import './hero.css';
import './footer.css';
import './header.css';
import './trust-intro.css';
import './preloader.css';

const path = window.location.pathname.replace(/\/+$/, '') || '/';
const page = path === '/admin' || path === '/admin/login' ? <AdminRoutes /> : <App />;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{page}<InitialLoader /></React.StrictMode>,
);