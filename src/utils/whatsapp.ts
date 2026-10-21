export const PHONE = '919211257788';

export type WhatsAppInquiry = {
  category: string;
  fullName: string;
  phoneNumber: string;
  email?: string;
  location?: string;
  propertyType?: string;
  budget?: string;
  requirements?: string;
};

export function whatsapp(message: string) {
  return `https://wa.me/${PHONE}?text=${encodeURIComponent(message)}`;
}

export function formatWhatsAppInquiry(inquiry: WhatsAppInquiry) {
  const lines = [
    'Property Deal – New Property Inquiry',
    '',
    `Inquiry Category: ${inquiry.category}`,
    `Full Name: ${inquiry.fullName.trim()}`,
    `Phone Number: ${inquiry.phoneNumber.trim()}`,
  ];

  const optionalFields: Array<[string, string | undefined]> = [
    ['Email', inquiry.email],
    ['Property Location', inquiry.location],
    ['Property Type', inquiry.propertyType],
    ['Budget / Expected Price', inquiry.budget],
    ['Additional Requirements', inquiry.requirements],
  ];

  for (const [label, value] of optionalFields) {
    const trimmedValue = value?.trim();
    if (trimmedValue) lines.push(`${label}: ${trimmedValue}`);
  }

  lines.push('', 'Please contact me regarding this inquiry.');
  return lines.join('\n');
}

export function openWhatsApp(message: string) {
  return window.open(whatsapp(message), '_blank', 'noopener,noreferrer');
}

export function openWhatsAppInquiry(inquiry: WhatsAppInquiry) {
  const url = whatsapp(formatWhatsAppInquiry(inquiry));
  window.open(url, '_blank', 'noopener,noreferrer');
  return url;
}