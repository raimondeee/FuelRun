// Conservative brand matching for OSM amenity=fuel tags. Returns a FuelRun brand key or ''.
// Order: brand:wikidata / operator:wikidata exact → brand/name/operator regex.
export const WIKIDATA = {
  sa: ['Q138718151'],
  maverik: ['Q64149010'],
  arco: ['Q304769', 'Q306960'], // ARCO, ampm (ARCO's store brand)
  costco: ['Q715583'],
};
const RX = {
  sa: /\bspace\s*age\b/i,
  maverik: /\bmaverik\b/i,
  arco: /\barco\b|^\s*am\s*pm\s*$/i,
  costco: /\bcostco\b/i,
  nomnom: /\bnom\s*nom\b/i,
};
// Tribal ownership is independent of the fuel brand (many are Chevron/Shell/Cenex-branded), so tribal
// signals are checked on every station that isn't one of the other preferred brands.
// Tribal: only explicit ownership signals. Words like "Tribe/Tribal/Nation/Confederated/Band of"
// in brand/operator/owner/name, or a tribe/tribal-enterprise name that is NOT also a common
// place name (so no "Spokane", "Chehalis", "Puyallup", "Umatilla", "Yakima", "Colville", …).
const TRIBAL_WORDS = /\b(tribe|tribes|tribal|confederated|band of|indian nation|first nation|yakama nation)\b/i;
const TRIBAL_NAMES = /\b(muckleshoot|tulalip|quil\s*ceda|squaxin|kamilche trading post|nisqually|red wind|suquamish|swinomish|lummi|stillaguamish|kalispel|shoshone[- ]bannock|coquille|makah|quinault|s'?klallam|skokomish|quileute|chippewa cree|blackfeet|salish (and|&) kootenai|nez perce|cow creek|warm springs ventures|arrowhead travel plaza|yakama|yakamart|colville fuels)\b/i;
export function brandKey(t) {
  const wd = [t['brand:wikidata'], t['operator:wikidata']].filter(Boolean);
  // A conflicting brand wins over a name: e.g. brand=Chevron name="Space Age" → not Space Age.
  for (const [k, ids] of Object.entries(WIKIDATA)) if (wd.some(w => ids.includes(w))) return k;
  const brand = t.brand || '', name = t.name || '', op = t.operator || '', owner = t.owner || '';
  const fields = [brand, name, op];
  const otherBrandWd = wd.length > 0; // has a wikidata brand that isn't one of ours
  for (const k of ['sa', 'maverik', 'arco', 'costco', 'nomnom']) {
    if (RX[k].test(brand) || RX[k].test(op)) return k;
    // name-only match is ignored when a different brand:wikidata is present (e.g. Chevron named "Space Age"),
    // except NomNom, a store chain that sells other fuel brands (e.g. Cenex).
    if ((!otherBrandWd || k === 'nomnom') && RX[k].test(name)) return k;
  }
  const tribalTxt = [brand, op, owner, name, t['operator:type'] === 'tribal' ? 'tribal' : ''].join(' | ');
  if (TRIBAL_WORDS.test(tribalTxt) || TRIBAL_NAMES.test([brand, op, owner, name].join(' | '))) return 'tribal';
  return '';
}
export const membersOnly = (k, t) => k === 'costco' || t.access === 'customers' || t.access === 'members' || t.membership === 'yes' ? 1 : 0;
