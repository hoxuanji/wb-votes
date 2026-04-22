#!/usr/bin/env node
/**
 * fix-gender.js — Infers gender from Indian name heuristics. Conservative.
 * Run: node scripts/scraper/fix-gender.js
 */
const fs = require('fs');
const path = require('path');

const CANDIDATES_FILE = path.resolve(__dirname, '../../src/data/candidates.ts');

// Only clearly female names — ambiguous names (Santosh, Sujan, Chandra, Soma) are excluded
const FEMALE_FIRST_NAMES = new Set([
  // Bengali female — unambiguous
  'mamata','priya','kavita','sunita','anita','rekha','usha','asha','meena','geeta',
  'sita','rita','nita','puja','maya','lata','hema','gita','rupa','mita','mala',
  'bela','kalpana','swapna','sumita','archana','shobha','jyoti','sarita','savita',
  'seema','neeta','pratima','golapi','dipali','shikha','sangita','suparna','susmita',
  'moumita','rituparna','debasri','tanushree','subhasree','chandrima','sagarika',
  'payel','shreya','sayani','mitali','urmila','lakshmi','laxmi','durga','parvati',
  'radha','savitri','ganga','bijaya','bulbul',
  'champa','chandana','chhanda','chaitali','dipa','dipti','dipika','deepa',
  'gouri','gitanjali','hena','hira','indrani','indira','jaya','jayashree','jharna',
  'kaberi','kakali','kanak','kasturi','konika','krishnakali',
  'leena','lily','lina','madhuri','malati','manju','manjula','mausumi','meghna',
  'mili','minati','minakshi','mishti','moushumi','nandini','nayantara',
  'nitu','nibedita','padma','paramita','parbati','pari','paromita','paulami',
  'piyali','prativa','pritilata','priyanka','purabi','reba','rina','rinku','rinu',
  'riya','roma','rumi','sabita','sandhya','sanghamitra','saraswati','sathi',
  'shila','shilpi','shipra','shubhra','sikha','sipra',
  'smriti','sneha','srabani','subha','subhasri','sucharita','suchismita',
  'sudeshna','sukla','sulekha','sunetra','supriya','surojita','sutapa',
  'swati','tatini','tina','tithi','trishna','tulika','uma','urmi',
  'kalyani','kusum','koel','rupali','sushmita','monalisa',
  'madhabi','malabika','nandalata','nabanita','namita','nandita',
  'priyali','rimpa','rimpi','rupam','sanchita','sanjukta',
  'sharmistha','shefali','shilpa','shipa','shiuli','shraboni',
  'shreemoyee','shreyasi','shyamali','silpa',
  'smita','sreyashi','subhalakshmi','subhashree','suchetana','suchitra',
  'sudha','sukanya','sulagna','sulogna','sumalya','sumana','sumitra',
  'sunanda','sunandita','suneeta','supriti','suravi','suriya','suryasri',
  'swagata','swapnasri','sweta','tamalika','tanima','tani','tanushri',
  'taposree','tapasi','trisha','trishita','troyee','tumpa',
  'urvashi','uttara','vaishali','vandana','vidya','vina','vineeta',
  'yasmin','yasmine','yashoda',
  // Hindu female names (broader)
  'aditi','ahana','aishwarya','akanksha','akshara','alka','amrita','anasuya',
  'ananya','anjali','ankita','annapurna','aparna','aradhana','aruna','arunima',
  'avantika','avni','ayesha',
  'bhagyashri','bharati','bhavana','bhavani','bhumika',
  'chhaya','darshana','devaki','devyani','dhara','divya',
  'gayatri','geetanjali','hansika','hansa','harshita','hemalata','himani',
  'iravati','ishita','isha',
  'jalaja','janaki','jasmine','jasoda','jhimli',
  'kamakshi','kamala','kamini','kamla','kanchan','kanta','kaveri','kavitha',
  'khushi','kirti','komal','kritika',
  'latika','lavanya','laxmibai',
  'madhu','mahalakshmi','mahima','malashri','malvika','mandakini',
  'manisha','manjari','manorama','meera','menaka','mina','mohini','mrinalini',
  'mukta',
  'narmada','neelam','nisha','nishita','nutan',
  'panchali','pinki','poonam','poornima','prerana','preethi','preeti',
  'rachana','radhika','rajashree','rajlakshmi','ranjana','ranjita',
  'ratna','revati','rohini','rukmini',
  'sahana','saheli','saira','sakina','sapna','sarbani','sarla','saroj','saroja',
  'sarojini','shanta','sharmila','shashi','sheetal','shirin','shital','shivani',
  'shraddha','shree','shreeya','shridevi','shriya','shubha','shyama',
  'simran','snigdha','sreelekha','sreemoyee','srilata','subhashini','subhra',
  'sujata','sulata','sulochan','sunayani','sundari','suraiya','suroma',
  'tahmina','tara','thakurani',
  'ujjala','ujjwala','urvasi',
  'vatsala','veena','vijaya','vijaylakshmi','vimala','vishakha',
  // Muslim female names common in Bengal (unambiguous ones)
  'amina','anjuman','anwara','arifa','asma','atia','ayasha','azra',
  'bilkis','dilshad','farida','farjana','farhana','farzana','fatema','fatima',
  'firdous','firoza','fouzia','gulnahar','gulshana','habiba','halima','hamida',
  'hasina','heena','jabina','jamila','jannat','jasmin','jasmina',
  'khadija','khairun','kulsum','laila','laily','layla','lutfun',
  'mahfuza','mahina','mahnoor','mahzabin','mamona','marzina','masuma',
  'mayna','minara','mousumi','mumu','nafisa','naima','najma','nasima',
  'nasrin','nazneen','nazma','nilufar','nilima','nilufer','nipa','niru',
  'parveen','rabia','rahima','razia','reshma','rifat','rohima','roksana',
  'rubina','ruhina','rukshana','sabina','sadia','sahanara','sahina','sajeda',
  'saleha','salma','samia','sanjida','sara','sarmin','selina','shahanara',
  'shaheda','shahina','shahla','shakila','shanaz','shapla','sharifa',
  'shirina','shirin','shirmin','shoma','shormila','shuktara','shumaiya',
  'sofia','sumaiya','sumia','suraiya','tahmina','taslima','tasnuva','thamina',
  'tutun','wahida','zebun','zeenat','zerina','zubaida',
]);

// Unambiguous female name suffixes
const FEMALE_SUFFIXES = [' devi', ' kumari', ' bai', ' rani', ' mata', ' kali'];

function hasFemaleTitleOrPrefix(name) {
  const n = name.toLowerCase();
  return /\bsmt\.?\s/.test(n) || /\bsrimati\b/.test(n) ||
         /^kumari\s/i.test(name) || /\bms\.\s/.test(n) || /\bmrs\.\s/.test(n);
}

function hasFemaleNameSuffix(name) {
  const n = ' ' + name.toLowerCase();
  return FEMALE_SUFFIXES.some(s => n.endsWith(s) || n.includes(s + ' '));
}

function inferGender(name) {
  if (!name) return null;
  if (hasFemaleTitleOrPrefix(name)) return 'Female';
  if (hasFemaleNameSuffix(name)) return 'Female';
  // Match first word only
  const words = name.trim().split(/\s+/);
  const first = words[0].toLowerCase();
  if (FEMALE_FIRST_NAMES.has(first)) {
    // Reject if second word is "Kumar" (e.g. "Saroj Kumar" = male)
    const second = (words[1] ?? '').toLowerCase();
    if (second === 'kumar' || second === 'chandra' || second === 'nath') return null;
    return 'Female';
  }
  return null;
}

// ---------------------------------------------------------------------------
const raw = fs.readFileSync(CANDIDATES_FILE, 'utf8');
const arrayMatch = raw.match(/(export const candidates: Candidate\[\] = )(\[[\s\S]+?\])(;\n\nexport function)/);
if (!arrayMatch) { console.error('Cannot find candidates array'); process.exit(1); }

const candidates = JSON.parse(arrayMatch[2]);
console.log(`Loaded ${candidates.length} candidates`);

// Reset all to Male first, then apply inference
let updated = 0;
for (const c of candidates) {
  const old = c.gender;
  c.gender = inferGender(c.name) === 'Female' ? 'Female' : 'Male';
  if (c.gender !== old) updated++;
}

const femaleCount = candidates.filter(c => c.gender === 'Female').length;
console.log(`Female: ${femaleCount} (changed: ${updated})`);

// Sample verification
const samples = candidates.filter(c => c.gender === 'Female').slice(0, 25);
console.log('\nSample female candidates (verify manually):');
samples.forEach(c => console.log(` ✓ ${c.name}`));

fs.writeFileSync(CANDIDATES_FILE, raw.replace(arrayMatch[2], JSON.stringify(candidates, null, 2)), 'utf8');
console.log('\n✅ Written to src/data/candidates.ts');
