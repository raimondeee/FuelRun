// Brand keys, labels and colors. Matching lives in scripts/brands.mjs (build time).
export type BrandKey = 'sa' | 'maverik' | 'arco' | 'costco' | 'nomnom' | 'tribal';
export const BRANDS: { key: BrandKey; label: string; color: string; note?: string }[] = [
  { key: 'sa', label: 'Space Age', color: '#16a34a' },
  { key: 'maverik', label: 'Maverik', color: '#dc2626' },
  { key: 'arco', label: 'ARCO', color: '#2563eb' },
  { key: 'costco', label: 'Costco', color: '#0891b2', note: 'members only' },
  { key: 'nomnom', label: 'NomNom', color: '#db2777' },
  { key: 'tribal', label: 'Tribal-owned stations', color: '#92400e' },
];
export const FALLBACK_COLOR = '#ea580c';
export const brandOf = (k?: string) => BRANDS.find(b => b.key === k);
export const DEFAULT_PREFS: { key: BrandKey; on: boolean }[] = BRANDS.map(b => ({ key: b.key, on: b.key === 'sa' }));
