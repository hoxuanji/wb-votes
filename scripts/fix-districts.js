#!/usr/bin/env node
/**
 * fix-districts.js — patches constituencies.ts with correct WB district names
 * based on the official assembly segment number → district mapping.
 * Run: node scripts/fix-districts.js
 */

const fs = require('fs');
const path = require('path');

// Official WB 2021 delimitation: assembly number ranges → district
const DISTRICT_RANGES = [
  [1,   9,   'Cooch Behar'],
  [10,  14,  'Alipurduar'],
  [15,  21,  'Jalpaiguri'],
  [22,  27,  'Darjeeling'],
  [28,  28,  'Kalimpong'],
  [29,  37,  'Uttar Dinajpur'],
  [38,  43,  'Dakshin Dinajpur'],
  [44,  55,  'Malda'],
  [56,  78,  'Murshidabad'],
  [79,  89,  'Birbhum'],
  [90,  98,  'Paschim Bardhaman'],
  [99,  110, 'Purba Bardhaman'],
  [111, 127, 'Nadia'],
  [128, 160, 'North 24 Parganas'],
  [161, 171, 'Kolkata'],
  [172, 187, 'Howrah'],
  [188, 205, 'Hooghly'],
  [206, 210, 'Jhargram'],
  [211, 226, 'Paschim Medinipur'],
  [227, 238, 'Bankura'],
  [239, 247, 'Purulia'],
  [248, 278, 'South 24 Parganas'],
  [279, 999, 'Purba Medinipur'], // catch-all for high Myneta IDs in this region
];

// Manual overrides for known constituencies with Myneta IDs > 294
const MANUAL_OVERRIDES = {
  295: 'Paschim Bardhaman',  // Kulti
  296: 'Paschim Bardhaman',  // Barabani
  297: 'Birbhum',            // Dubrajpur
  298: 'Birbhum',            // Suri
  300: 'Birbhum',            // Nanoor
  301: 'Birbhum',            // Labhpur
  302: 'Birbhum',            // Sainthia
  303: 'Birbhum',            // Mayureswar
  304: 'Birbhum',            // Rampurhat
  305: 'Murshidabad',        // Hansan
  306: 'Murshidabad',        // Nalhati
  307: 'Murshidabad',        // Murarai
};

function getDistrict(assemblyNumber) {
  if (MANUAL_OVERRIDES[assemblyNumber]) return MANUAL_OVERRIDES[assemblyNumber];
  for (const [start, end, district] of DISTRICT_RANGES) {
    if (assemblyNumber >= start && assemblyNumber <= end) return district;
  }
  return 'West Bengal';
}

const filePath = path.resolve(__dirname, '../src/data/constituencies.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Parse all constituency objects and patch district values
let fixedCount = 0;
content = content.replace(
  /"assemblyNumber":\s*(\d+),\s*"name":\s*"([^"]+)",\s*"nameBn":\s*"([^"]+)",\s*"district":\s*"West Bengal",\s*"districtBn":\s*"West Bengal"/g,
  (match, num, name, nameBn) => {
    const district = getDistrict(parseInt(num, 10));
    fixedCount++;
    return `"assemblyNumber": ${num},\n    "name": "${name}",\n    "nameBn": "${nameBn}",\n    "district": "${district}",\n    "districtBn": "${district}"`;
  }
);

fs.writeFileSync(filePath, content, 'utf8');
console.log(`✅  Fixed districts for ${fixedCount} constituencies.`);
console.log('   → src/data/constituencies.ts');
