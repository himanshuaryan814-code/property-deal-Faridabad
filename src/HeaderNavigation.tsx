import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowRight, ArrowUpRight, ChevronDown, Menu, Phone, X } from 'lucide-react';
import {
  getSearchCategories,
  resolveSearchPropertyType,
  type SearchMode,
  type SearchTab,
} from './PropertySearchNavigation';
import type { CategoryOption } from './PropertySearchNavigation';

type HeaderMenu = 'Properties' | 'Buy' | 'Sell' | 'Rent' | 'About' | 'Commercial' | 'Plots/Land';

type Props = {
  propertyTypes: string[];
  onSelectTab: (tab: SearchTab) => void;
  onSelectCategory: (mode: SearchMode, propertyType: string) => void;
};

const menuId = (menu: HeaderMenu) => `header-menu-${menu.toLowerCase().replace(/[^a-z]+/g, '-')}`;

export default function HeaderNavigation({ propertyTypes, onSelectTab, onSelectCategory }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<HeaderMenu | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<Partial<Record<HeaderMenu, HTMLButtonElement | null>>>({});
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const clickOpenedMenu = useRef<HeaderMenu | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        clickOpenedMenu.current = null;
        setOpenMenu(null);
        setMobileOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (mobileOpen) mobileMenuRef.current?.focus();
      else if (openMenu) triggerRefs.current[openMenu]?.focus();
      clickOpenedMenu.current = null;
      setOpenMenu(null);
      setMobileOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen, openMenu]);

  function closeMenus() {
    clickOpenedMenu.current = null;
    setOpenMenu(null);
    setMobileOpen(false);
  }

  function showSearch(tab: SearchTab) {
    onSelectTab(tab);
    closeMenus();
    document.getElementById('search')?.scrollIntoView({ behavior: 'smooth' });
  }

  function showCategory(mode: SearchMode, category: CategoryOption) {
    onSelectCategory(mode, resolveSearchPropertyType(category, propertyTypes));
    closeMenus();
    document.getElementById('search')?.scrollIntoView({ behavior: 'smooth' });
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, menu: HeaderMenu) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpenMenu(menu);
      window.requestAnimationFrame(() => {
        document.getElementById(menuId(menu))?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
      });
    }
  }

  function handleMenuItemKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(event.currentTarget.closest('[role="menu"]')?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const currentIndex = items.indexOf(event.currentTarget);
    const nextIndex = event.key === 'ArrowDown'
      ? (currentIndex + 1) % items.length
      : (currentIndex - 1 + items.length) % items.length;
    event.preventDefault();
    items[nextIndex]?.focus();
  }

  function renderCategoryMenu(mode: SearchMode) {
    return getSearchCategories(mode).map(category => (
      <button
        className="header-menu-link"
        key={category.label}
        type="button"
        role="menuitem"
        onKeyDown={handleMenuItemKeyDown}
        onClick={() => showCategory(mode, category)}
      >
        <span>{category.label}</span><ArrowRight size={14} aria-hidden="true" />
      </button>
    ));
  }

  function renderSearchLink(label: string, tab: SearchTab) {
    return (
      <button className="header-menu-link" key={label} type="button" role="menuitem" onKeyDown={handleMenuItemKeyDown} onClick={() => showSearch(tab)}>
        <span>{label}</span><ArrowRight size={14} aria-hidden="true" />
      </button>
    );
  }

  function renderAnchor(label: string, href: string) {
    return (
      <a className="header-menu-link" key={label} href={href} role="menuitem" onKeyDown={handleMenuItemKeyDown} onClick={closeMenus}>
        <span>{label}</span><ArrowUpRight size={14} aria-hidden="true" />
      </a>
    );
  }

  function menuContents(menu: HeaderMenu) {
    if (menu === 'Buy' || menu === 'Rent' || menu === 'Commercial' || menu === 'Plots/Land') {
      return <div className="header-menu-list" role="menu" id={menuId(menu)}>{renderCategoryMenu(menu)}</div>;
    }

    if (menu === 'Properties') {
      return (
        <div className="header-properties-menu" role="menu" id={menuId(menu)}>
          <div>
            <span className="header-menu-eyebrow">FIND A PROPERTY</span>
            <div className="header-menu-list">
              {renderSearchLink('Buy a home', 'Buy')}
              {renderSearchLink('Find a rental', 'Rent')}
              {renderSearchLink('Commercial property', 'Commercial')}
              {renderSearchLink('Plots & land', 'Plots/Land')}
            </div>
          </div>
          <div>
            <span className="header-menu-eyebrow">EXPLORE</span>
            <div className="header-menu-list">
              {renderAnchor('Published properties', '#properties')}
              {renderSearchLink('Projects', 'Projects')}
              {renderSearchLink('Post Property — FREE', 'Post Property')}
              {renderSearchLink('Property inquiry', 'Inquiry')}
            </div>
            <p className="header-menu-note">Project availability is shown in the existing search section.</p>
          </div>
        </div>
      );
    }

    if (menu === 'Sell') {
      return (
        <div className="header-menu-list" role="menu" id={menuId(menu)}>
          {renderAnchor('Sell a property', '#sell')}
          {renderSearchLink('List a property', 'Post Property')}
          {renderAnchor('Get property assistance', '#contact')}
          {renderAnchor('Contact our team', '#contact')}
        </div>
      );
    }

    return (
      <div className="header-menu-list" role="menu" id={menuId(menu)}>
        {renderAnchor('About Property Deal', '#about')}
        {renderAnchor('Why Choose Us', '#intro-trust-title')}
        {renderAnchor('Published properties', '#properties')}
        {renderAnchor('Contact us', '#contact')}
        {renderSearchLink('Raise an inquiry', 'Inquiry')}
      </div>
    );
  }

  function renderMenu(menu: HeaderMenu) {
    const expanded = openMenu === menu;
    return (
      <div
        className={`nav-item nav-item-${menu.toLowerCase().replace(/[^a-z]+/g, '-')}${expanded ? ' is-open' : ''}`}
        key={menu}
        onMouseEnter={() => {
          if (window.matchMedia('(hover: hover)').matches) {
            if (clickOpenedMenu.current !== menu) clickOpenedMenu.current = null;
            setOpenMenu(menu);
          }
        }}
        onMouseLeave={() => {
          if (window.matchMedia('(hover: hover)').matches) {
            if (clickOpenedMenu.current === menu) clickOpenedMenu.current = null;
            setOpenMenu(current => current === menu ? null : current);
          }
        }}
      >
        <button
          className="header-nav-trigger"
          type="button"
          aria-haspopup="menu"
          aria-expanded={expanded}
          aria-controls={menuId(menu)}
          ref={element => { triggerRefs.current[menu] = element; }}
          onClick={() => {
            if (openMenu === menu && clickOpenedMenu.current === menu) {
              setOpenMenu(null);
              clickOpenedMenu.current = null;
            } else {
              setOpenMenu(menu);
              clickOpenedMenu.current = menu;
            }
          }}
          onKeyDown={event => handleTriggerKeyDown(event, menu)}
        >
          {menu}<ChevronDown size={13} aria-hidden="true" />
        </button>
        <div className={`header-dropdown${menu === 'Properties' ? ' header-dropdown-wide' : ''}`} hidden={!expanded}>
          {menuContents(menu)}
        </div>
      </div>
    );
  }

  return (
    <header className="header" ref={headerRef}>
      <a className="wordmark" href="#home" aria-label="Property Deal home">
        <img className="brand-logo" src="/—Pngtree—real%20estate%20logo_4103471.png" alt="Property Deal Logo" />
        <span>Property Deal<small>REAL ESTATE · FARIDABAD</small></span>
      </a>
      <nav id="property-deal-main-navigation" className={`nav nav-left ${mobileOpen ? 'nav-open' : ''}`} aria-label="Main navigation">
        {(['Properties', 'Buy', 'Sell', 'Rent', 'Commercial', 'Plots/Land', 'About'] as HeaderMenu[]).map(renderMenu)}
        <a className="header-nav-link" href="/admin/login" onClick={closeMenus}>Admin Panel</a>
      </nav>
      <div className="header-right">
        <div className="header-phones">
          <a className="header-phone" href="tel:+919211257788"><Phone size={15} aria-hidden="true" /> +91 92112 57788</a>
          <a className="header-phone" href="tel:+919891475788"><Phone size={15} aria-hidden="true" /> +91 98914 75788</a>
        </div>
        <a className="button button-dark button-small" href="#contact" onClick={closeMenus}>Let's Talk <ArrowUpRight size={15} /></a>
        <button
          className="mobile-menu icon-btn"
          type="button"
          ref={mobileMenuRef}
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileOpen}
          aria-controls="property-deal-main-navigation"
          onClick={() => { setMobileOpen(current => !current); setOpenMenu(null); }}
        >
          {mobileOpen ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}
