import { useEffect, useRef, useState } from 'react';
import { Building2, Home, KeyRound, MapPin, MessageCircle, Plus, Sparkles } from 'lucide-react';

export type SearchMode = 'Buy' | 'Rent' | 'Commercial' | 'Plots/Land';
export type SearchTab = SearchMode | 'Sell' | 'Projects' | 'Post Property' | 'Inquiry';

export type CategoryOption = {
  label: string;
  matches: string[];
};

type NavigationItem = {
  label: SearchTab;
  icon: typeof Home;
  categories?: CategoryOption[];
};

const navigationItems: NavigationItem[] = [
  {
    label: 'Buy',
    icon: Home,
    categories: [
      { label: 'Flats / Apartments', matches: ['flat', 'flats', 'apartment', 'apartments'] },
      { label: 'Independent Houses', matches: ['independent house', 'independent houses'] },
      { label: 'Villas', matches: ['villa', 'villas'] },
      { label: 'Builder Floors', matches: ['builder floor', 'builder floors'] },
      { label: 'Residential Plots', matches: ['residential plot', 'residential plots', 'plot', 'plots'] },
      { label: 'Farmhouses', matches: ['farmhouse', 'farmhouses'] },
      { label: 'New Projects', matches: ['new project', 'new projects', 'project', 'projects'] },
    ],
  },
  {
    label: 'Rent',
    icon: KeyRound,
    categories: [
      { label: 'Flats / Apartments', matches: ['flat', 'flats', 'apartment', 'apartments'] },
      { label: 'Independent Houses', matches: ['independent house', 'independent houses'] },
      { label: 'Builder Floors', matches: ['builder floor', 'builder floors'] },
      { label: 'Villas', matches: ['villa', 'villas'] },
      { label: 'PG / Paying Guest', matches: ['pg', 'paying guest'] },
      { label: 'Shared Accommodation', matches: ['shared accommodation'] },
      { label: 'Farmhouses', matches: ['farmhouse', 'farmhouses'] },
    ],
  },
  {
    label: 'Sell',
    icon: Building2,
  },
  {
    label: 'Commercial',
    icon: Building2,
    categories: [
      { label: 'Office Spaces', matches: ['office space', 'office spaces'] },
      { label: 'Retail Shops', matches: ['retail shop', 'retail shops', 'shop', 'shops'] },
      { label: 'Showrooms', matches: ['showroom', 'showrooms'] },
      { label: 'Commercial Buildings', matches: ['commercial building', 'commercial buildings'] },
      { label: 'Commercial Plots', matches: ['commercial plot', 'commercial plots'] },
      { label: 'Warehouses', matches: ['warehouse', 'warehouses'] },
      { label: 'Industrial Properties', matches: ['industrial property', 'industrial properties'] },
    ],
  },
  {
    label: 'Plots/Land',
    icon: MapPin,
    categories: [
      { label: 'Residential Plots', matches: ['residential plot', 'residential plots', 'plot', 'plots'] },
      { label: 'Commercial Plots', matches: ['commercial plot', 'commercial plots'] },
      { label: 'Agricultural Land', matches: ['agricultural land'] },
      { label: 'Farm Land', matches: ['farm land', 'farmland'] },
      { label: 'Industrial Land', matches: ['industrial land'] },
    ],
  },
  {
    label: 'Projects',
    icon: Sparkles,
  },
  {
    label: 'Post Property',
    icon: Plus,
  },
  {
    label: 'Inquiry',
    icon: MessageCircle,
  },
];

export function getSearchCategories(mode: SearchMode): CategoryOption[] {
  return navigationItems.find(item => item.label === mode)?.categories ?? [];
}

export function resolveSearchPropertyType(option: CategoryOption, propertyTypes: string[]): string {
  return propertyTypes.find(type => option.matches.includes(type.trim().toLowerCase())) ?? option.label;
}

type Props = {
  activeTab: SearchTab;
  propertyTypes: string[];
  onSelectTab: (tab: SearchTab) => void;
  onSelectCategory: (mode: SearchMode, propertyType: string) => void;
};

function isSearchMode(tab: SearchTab): tab is SearchMode {
  return tab === 'Buy' || tab === 'Rent' || tab === 'Commercial' || tab === 'Plots/Land';
}

export default function PropertySearchNavigation({
  activeTab,
  propertyTypes,
  onSelectTab,
  onSelectCategory,
}: Props) {
  const [openMenu, setOpenMenu] = useState<SearchMode | null>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Partial<Record<SearchMode, HTMLButtonElement | null>>>({});
  const hoverOpenedMenu = useRef<SearchMode | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!navigationRef.current?.contains(event.target as Node)) {
        hoverOpenedMenu.current = null;
        setOpenMenu(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && openMenu) {
        hoverOpenedMenu.current = null;
        setOpenMenu(null);
        triggerRefs.current[openMenu]?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  return (
    <div className="search-tabs" role="tablist" aria-label="Property goal" ref={navigationRef}>
      {navigationItems.map(item => {
        const mode = isSearchMode(item.label) ? item.label : null;
        const Icon = item.icon;
        const isOpen = mode !== null && openMenu === mode;

        return (
          <div
            className="search-tab-item"
            key={item.label}
            onMouseEnter={() => {
              if (mode && item.categories && window.matchMedia('(hover: hover)').matches) {
                hoverOpenedMenu.current = mode;
                setOpenMenu(mode);
              }
            }}
            onMouseLeave={() => {
              if (mode && item.categories && window.matchMedia('(hover: hover)').matches) {
                if (hoverOpenedMenu.current === mode) hoverOpenedMenu.current = null;
                setOpenMenu(current => current === mode ? null : current);
              }
            }}
          >
            <button
              id={`search-tab-${item.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
              type="button"
              role="tab"
              aria-selected={activeTab === item.label}
              aria-controls={item.categories
                ? `property-search-panel search-menu-${item.label.toLowerCase().replace(/[^a-z]+/g, '-')}`
                : 'property-search-panel'}
              aria-haspopup={item.categories ? 'menu' : undefined}
              aria-expanded={item.categories ? isOpen : undefined}
              className={`${activeTab === item.label ? 'active' : ''}${item.label === 'Post Property' ? ' post-property-tab' : ''}`}
              ref={mode ? element => { triggerRefs.current[mode] = element; } : undefined}
              onKeyDown={event => {
                if (mode && item.categories && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                  event.preventDefault();
                  setOpenMenu(mode);
                  const trigger = event.currentTarget;
                  requestAnimationFrame(() => {
                    const menu = trigger.parentElement?.querySelector<HTMLElement>('[role="menu"]');
                    const options = menu?.querySelectorAll<HTMLButtonElement>('button');
                    if (!options?.length) return;
                    options[event.key === 'ArrowDown' ? 0 : options.length - 1].focus();
                  });
                }
              }}
              onClick={() => {
                onSelectTab(item.label);
                if (mode && item.categories) {
                  const openedByHover = hoverOpenedMenu.current === mode;
                  hoverOpenedMenu.current = null;
                  if (openedByHover) setOpenMenu(mode);
                  else setOpenMenu(current => current === mode ? null : mode);
                } else {
                  hoverOpenedMenu.current = null;
                  setOpenMenu(null);
                }
              }}
            >
              <Icon size={16} aria-hidden="true"/>
              <span>{item.label}</span>
              {item.label === 'Post Property' && <span className="free-badge">FREE</span>}
            </button>
            {mode && item.categories && isOpen && (
              <div
                className="search-category-menu"
                id={`search-menu-${item.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                role="menu"
                aria-label={`${mode} property types`}
              >
                {item.categories.map(option => (
                  <button
                    type="button"
                    role="menuitem"
                    key={option.label}
                    onKeyDown={event => {
                      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                      event.preventDefault();
                      const options = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button');
                      if (!options?.length) return;
                      const index = [...options].indexOf(event.currentTarget);
                      options[(index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length].focus();
                    }}
                    onClick={() => {
                      onSelectCategory(mode, resolveSearchPropertyType(option, propertyTypes));
                      hoverOpenedMenu.current = null;
                      setOpenMenu(null);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
