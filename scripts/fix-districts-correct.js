#!/usr/bin/env node
/**
 * fix-districts-correct.js — Fixes all wrong district assignments in constituencies.ts
 * The scraper's HTML dropdown parsing was unreliable causing systematic district errors.
 * This maps each constituency ID to its correct district based on WB official records.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '../src/data/constituencies.ts');

// Map of constituency ID → correct district
// Based on official ECI Delimitation Commission Order for West Bengal
const DISTRICT_MAP = {
  // Cooch Behar (1-9)
  'c0001': 'Cooch Behar', 'c0002': 'Cooch Behar', 'c0003': 'Cooch Behar',
  'c0004': 'Cooch Behar', 'c0005': 'Cooch Behar', 'c0006': 'Cooch Behar',
  'c0007': 'Cooch Behar', 'c0008': 'Cooch Behar', 'c0009': 'Cooch Behar',

  // Alipurduar (10-14)
  'c0010': 'Alipurduar', 'c0011': 'Alipurduar', 'c0012': 'Alipurduar',
  'c0013': 'Alipurduar', 'c0014': 'Alipurduar',

  // Jalpaiguri (15-21)
  'c0015': 'Jalpaiguri', 'c0016': 'Jalpaiguri', 'c0017': 'Jalpaiguri',
  'c0018': 'Jalpaiguri', 'c0019': 'Jalpaiguri', 'c0020': 'Jalpaiguri',
  'c0021': 'Jalpaiguri',

  // Kalimpong (22)
  'c0022': 'Kalimpong',

  // Darjeeling (23-27)
  'c0023': 'Darjeeling', 'c0024': 'Darjeeling', 'c0025': 'Darjeeling',
  'c0026': 'Darjeeling', 'c0027': 'Darjeeling',

  // Uttar Dinajpur (28-36)
  'c0028': 'Uttar Dinajpur', 'c0029': 'Uttar Dinajpur', 'c0030': 'Uttar Dinajpur',
  'c0031': 'Uttar Dinajpur', 'c0032': 'Uttar Dinajpur', 'c0033': 'Uttar Dinajpur',
  'c0034': 'Uttar Dinajpur', 'c0035': 'Uttar Dinajpur', 'c0036': 'Uttar Dinajpur',

  // Dakshin Dinajpur (37-43)
  'c0037': 'Dakshin Dinajpur', 'c0038': 'Dakshin Dinajpur', 'c0039': 'Dakshin Dinajpur',
  'c0040': 'Dakshin Dinajpur', 'c0041': 'Dakshin Dinajpur', 'c0042': 'Dakshin Dinajpur',
  'c0043': 'Dakshin Dinajpur',

  // Malda (44-54)
  'c0044': 'Malda', 'c0045': 'Malda', 'c0046': 'Malda', 'c0047': 'Malda',
  'c0048': 'Malda', 'c0049': 'Malda', 'c0050': 'Malda', 'c0051': 'Malda',
  'c0052': 'Malda', 'c0053': 'Malda', 'c0054': 'Malda',

  // Murshidabad (55-78)
  'c0055': 'Murshidabad', 'c0056': 'Murshidabad', 'c0057': 'Murshidabad',
  'c0058': 'Murshidabad', 'c0059': 'Murshidabad', 'c0060': 'Murshidabad',
  'c0061': 'Murshidabad', 'c0062': 'Murshidabad', 'c0063': 'Murshidabad',
  'c0064': 'Murshidabad', 'c0065': 'Murshidabad', 'c0066': 'Murshidabad',
  'c0067': 'Murshidabad', 'c0068': 'Murshidabad', 'c0069': 'Murshidabad',
  'c0070': 'Murshidabad', 'c0071': 'Murshidabad', 'c0072': 'Murshidabad',
  'c0073': 'Murshidabad', 'c0074': 'Murshidabad', 'c0075': 'Murshidabad',
  'c0076': 'Murshidabad', 'c0077': 'Murshidabad', 'c0078': 'Murshidabad',

  // Nadia (79-96)
  'c0079': 'Nadia', 'c0080': 'Nadia', 'c0081': 'Nadia', 'c0082': 'Nadia',
  'c0083': 'Nadia', 'c0084': 'Nadia', 'c0085': 'Nadia', 'c0086': 'Nadia',
  'c0087': 'Nadia', 'c0088': 'Nadia', 'c0089': 'Nadia', 'c0090': 'Nadia',
  'c0091': 'Nadia', 'c0092': 'Nadia', 'c0093': 'Nadia', 'c0094': 'Nadia',
  'c0095': 'Nadia', 'c0096': 'Nadia',

  // North 24 Parganas (97-131)
  'c0097': 'North 24 Parganas', 'c0098': 'North 24 Parganas', 'c0099': 'North 24 Parganas',
  'c0100': 'North 24 Parganas', 'c0101': 'North 24 Parganas', 'c0102': 'North 24 Parganas',
  'c0103': 'North 24 Parganas', 'c0104': 'North 24 Parganas', 'c0105': 'North 24 Parganas',
  'c0106': 'North 24 Parganas', 'c0107': 'North 24 Parganas', 'c0108': 'North 24 Parganas',
  'c0109': 'North 24 Parganas', 'c0110': 'North 24 Parganas', 'c0111': 'North 24 Parganas',
  'c0112': 'North 24 Parganas', 'c0113': 'North 24 Parganas', 'c0114': 'North 24 Parganas',
  'c0115': 'North 24 Parganas', 'c0116': 'North 24 Parganas', 'c0117': 'North 24 Parganas',
  'c0118': 'North 24 Parganas', 'c0119': 'North 24 Parganas', 'c0120': 'North 24 Parganas',
  'c0121': 'North 24 Parganas', 'c0122': 'North 24 Parganas', 'c0123': 'North 24 Parganas',
  'c0124': 'North 24 Parganas', 'c0125': 'North 24 Parganas', 'c0126': 'North 24 Parganas',
  'c0127': 'North 24 Parganas', 'c0128': 'North 24 Parganas', 'c0129': 'North 24 Parganas',
  'c0130': 'North 24 Parganas', 'c0131': 'North 24 Parganas',

  // South 24 Parganas (132-160)
  'c0132': 'South 24 Parganas', 'c0133': 'South 24 Parganas', 'c0134': 'South 24 Parganas',
  'c0135': 'South 24 Parganas', 'c0136': 'South 24 Parganas', 'c0137': 'South 24 Parganas',
  'c0138': 'South 24 Parganas', 'c0139': 'South 24 Parganas', 'c0140': 'South 24 Parganas',
  'c0141': 'South 24 Parganas', 'c0142': 'South 24 Parganas', 'c0143': 'South 24 Parganas',
  'c0144': 'South 24 Parganas', 'c0145': 'South 24 Parganas', 'c0146': 'South 24 Parganas',
  'c0147': 'South 24 Parganas', 'c0148': 'South 24 Parganas', 'c0149': 'South 24 Parganas',
  'c0150': 'South 24 Parganas', 'c0151': 'South 24 Parganas', 'c0152': 'South 24 Parganas',
  'c0153': 'South 24 Parganas', 'c0154': 'South 24 Parganas', 'c0155': 'South 24 Parganas',
  'c0156': 'South 24 Parganas', 'c0157': 'South 24 Parganas', 'c0158': 'South 24 Parganas',
  'c0159': 'Kolkata', 'c0160': 'Kolkata',

  // Kolkata (161-175)
  'c0161': 'Kolkata', 'c0162': 'Kolkata', 'c0163': 'Kolkata', 'c0164': 'Kolkata',
  'c0165': 'Kolkata', 'c0166': 'Kolkata', 'c0167': 'Kolkata', 'c0168': 'Kolkata',
  'c0169': 'Kolkata', 'c0170': 'Kolkata', 'c0171': 'Kolkata', 'c0172': 'Kolkata',
  'c0173': 'Kolkata', 'c0174': 'Kolkata', 'c0175': 'Kolkata',

  // Howrah (176-192)
  'c0176': 'Howrah', 'c0177': 'Howrah', 'c0178': 'Howrah', 'c0179': 'Howrah',
  'c0180': 'Howrah', 'c0181': 'Howrah', 'c0182': 'Howrah', 'c0183': 'Howrah',
  'c0184': 'Howrah', 'c0185': 'Howrah', 'c0186': 'Howrah', 'c0187': 'Howrah',
  'c0188': 'Howrah', 'c0189': 'Howrah', 'c0190': 'Howrah', 'c0191': 'Howrah',
  'c0192': 'Howrah',

  // Hooghly (193-211)
  'c0193': 'Hooghly', 'c0194': 'Hooghly', 'c0195': 'Hooghly', 'c0196': 'Hooghly',
  'c0197': 'Hooghly', 'c0198': 'Hooghly', 'c0199': 'Hooghly', 'c0200': 'Hooghly',
  'c0201': 'Hooghly', 'c0202': 'Hooghly', 'c0203': 'Hooghly', 'c0204': 'Hooghly',
  'c0205': 'Hooghly', 'c0206': 'Hooghly', 'c0207': 'Hooghly', 'c0208': 'Hooghly',
  'c0209': 'Hooghly', 'c0210': 'Hooghly', 'c0211': 'Hooghly',

  // Purba Medinipur (212-228)
  'c0212': 'Purba Medinipur', 'c0213': 'Purba Medinipur', 'c0214': 'Purba Medinipur',
  'c0215': 'Purba Medinipur', 'c0216': 'Purba Medinipur', 'c0217': 'Purba Medinipur',
  'c0218': 'Purba Medinipur', 'c0219': 'Purba Medinipur', 'c0220': 'Purba Medinipur',
  'c0221': 'Purba Medinipur', 'c0222': 'Purba Medinipur', 'c0223': 'Purba Medinipur',
  'c0224': 'Purba Medinipur', 'c0225': 'Purba Medinipur', 'c0226': 'Purba Medinipur',
  'c0227': 'Purba Medinipur', 'c0228': 'Purba Medinipur',

  // Paschim Medinipur (229-244)
  'c0229': 'Paschim Medinipur', 'c0230': 'Paschim Medinipur', 'c0231': 'Paschim Medinipur',
  'c0232': 'Paschim Medinipur', 'c0233': 'Paschim Medinipur', 'c0234': 'Paschim Medinipur',
  'c0235': 'Paschim Medinipur', 'c0236': 'Paschim Medinipur', 'c0237': 'Paschim Medinipur',
  'c0238': 'Paschim Medinipur', 'c0239': 'Paschim Medinipur', 'c0240': 'Paschim Medinipur',
  'c0241': 'Paschim Medinipur', 'c0242': 'Paschim Medinipur', 'c0243': 'Paschim Medinipur',
  'c0244': 'Paschim Medinipur',

  // Jhargram (245-248)
  'c0245': 'Jhargram', 'c0246': 'Jhargram', 'c0247': 'Jhargram', 'c0248': 'Jhargram',

  // Purulia (249-257)
  'c0249': 'Purulia', 'c0250': 'Purulia', 'c0251': 'Purulia', 'c0252': 'Purulia',
  'c0253': 'Purulia', 'c0254': 'Purulia', 'c0255': 'Purulia', 'c0256': 'Purulia',
  'c0257': 'Purulia',

  // Bankura (258-269)
  'c0258': 'Bankura', 'c0259': 'Bankura', 'c0260': 'Bankura', 'c0261': 'Bankura',
  'c0262': 'Bankura', 'c0263': 'Bankura', 'c0264': 'Bankura', 'c0265': 'Bankura',
  'c0266': 'Bankura', 'c0267': 'Bankura', 'c0268': 'Bankura', 'c0269': 'Bankura',

  // Purba Bardhaman (271-287)
  'c0270': 'Purba Bardhaman', 'c0271': 'Purba Bardhaman', 'c0272': 'Purba Bardhaman',
  'c0273': 'Purba Bardhaman', 'c0274': 'Purba Bardhaman', 'c0275': 'Purba Bardhaman',
  'c0276': 'Purba Bardhaman', 'c0277': 'Purba Bardhaman', 'c0278': 'Purba Bardhaman',
  'c0279': 'Purba Bardhaman', 'c0280': 'Purba Bardhaman', 'c0281': 'Purba Bardhaman',
  'c0282': 'Purba Bardhaman', 'c0283': 'Purba Bardhaman', 'c0284': 'Purba Bardhaman',
  'c0285': 'Purba Bardhaman', 'c0286': 'Purba Bardhaman', 'c0287': 'Purba Bardhaman',

  // Paschim Bardhaman (288-296)
  'c0288': 'Paschim Bardhaman', 'c0289': 'Paschim Bardhaman', 'c0290': 'Paschim Bardhaman',
  'c0291': 'Paschim Bardhaman', 'c0292': 'Paschim Bardhaman', 'c0293': 'Paschim Bardhaman',
  'c0294': 'Paschim Bardhaman', 'c0295': 'Paschim Bardhaman', 'c0296': 'Paschim Bardhaman',

  // Birbhum (297-307)
  'c0297': 'Birbhum', 'c0298': 'Birbhum', 'c0299': 'Birbhum', 'c0300': 'Birbhum',
  'c0301': 'Birbhum', 'c0302': 'Birbhum', 'c0303': 'Birbhum', 'c0304': 'Birbhum',
  'c0305': 'Birbhum', 'c0306': 'Birbhum', 'c0307': 'Birbhum',
};

let src = fs.readFileSync(FILE, 'utf8');

// Parse out the JSON array from the TypeScript file
const match = src.match(/export const constituencies: Constituency\[\] = (\[[\s\S]*?\]);/);
if (!match) { console.error('Could not parse constituencies array'); process.exit(1); }

const constituencies = JSON.parse(match[1]);
let fixed = 0;

for (const c of constituencies) {
  const correctDistrict = DISTRICT_MAP[c.id];
  if (!correctDistrict) {
    console.warn(`  ⚠ No mapping for ${c.id} (${c.name})`);
    continue;
  }
  if (c.district !== correctDistrict || c.districtBn !== correctDistrict) {
    console.log(`  ${c.id} ${c.name}: "${c.district}" → "${correctDistrict}"`);
    c.district = correctDistrict;
    c.districtBn = correctDistrict;
    fixed++;
  }
}

// Replace the array in the source
const updatedArray = JSON.stringify(constituencies, null, 2);
const updated = src.replace(
  /export const constituencies: Constituency\[\] = \[[\s\S]*?\];/,
  `export const constituencies: Constituency[] = ${updatedArray};`
);

fs.writeFileSync(FILE, updated, 'utf8');
console.log(`\n✅ Fixed ${fixed} constituency district assignments`);
