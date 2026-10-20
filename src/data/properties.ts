export type Property = {
  id: string;
  slug: string;
  title: string;
  purpose: 'Buy' | 'Rent';
  type: string;
  city: string;
  locality: string;
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  area: number | null;
  description: string;
  images: string[];
  featured: boolean;
  sample: boolean;
};

export const inr = (amount: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(amount);
