#!/usr/bin/env node
/**
 * enrich-occupation.js — Re-fetches myneta.info detail pages to extract
 * "Self Profession:" for all candidates. Updates candidates.ts in-place.
 *
 * Run: node scripts/scraper/enrich-occupation.js
 * ETA: ~5 min for 2707 candidates at concurrency 6 / 300ms delay
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONCURRENCY = 6;
const DELAY_MS = 300;
const CANDIDATES_FILE = path.resolve(__dirname, '../../src/data/candidates.ts');

function get(url, retries) {
  retries = retries === undefined ? 2 : retries;
  return new Promise(function(resolve, reject) {
    function attempt(n) {
      exec(
        'curl -s -L --max-time 15 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "' + url + '"',
        { maxBuffer: 5 * 1024 * 1024 },
        function(err, stdout) {
          if (err) {
            if (n < retries) setTimeout(function() { attempt(n + 1); }, 600);
            else reject(err);
          } else resolve(stdout);
        }
      );
    }
    attempt(0);
  });
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function pool(tasks, concurrency) {
  var idx = 0;
  function worker() {
    if (idx >= tasks.length) return Promise.resolve();
    var i = idx++;
    return tasks[i]().then(worker, worker);
  }
  var workers = [];
  for (var i = 0; i < Math.min(concurrency, tasks.length); i++) workers.push(worker());
  return Promise.all(workers);
}

function extractOccupation(html) {
  var m = html.match(/<b>Self\s+Profession:<\/b>\s*([^<\r\n]{1,80})/i);
  if (!m) return null;
  var raw = m[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw || raw === '-' || /^nil$/i.test(raw) || raw === 'N.A.' || raw === 'NA') return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function extractCandidateId(url) {
  var m = url && url.match(/candidate_id=(\d+)/);
  return m ? m[1] : null;
}

var raw = fs.readFileSync(CANDIDATES_FILE, 'utf8');
var arrayMatch = raw.match(/(export const candidates: Candidate\[\] = )(\[[\s\S]+?\])(;\n\nexport function)/);
if (!arrayMatch) { console.error('Cannot find candidates array'); process.exit(1); }

var candidates = JSON.parse(arrayMatch[2]);
console.log('Loaded ' + candidates.length + ' candidates');

var toFetch = candidates.filter(function(c) { return !c.occupation || c.occupation === 'Not declared'; });
console.log('Need occupation: ' + toFetch.length + ', already have: ' + (candidates.length - toFetch.length));
if (toFetch.length === 0) { console.log('Nothing to do.'); process.exit(0); }

var done = 0, found = 0;
var startTime = Date.now();

var tasks = toFetch.map(function(cand) {
  return function() {
    var candidateId = extractCandidateId(cand.affidavitUrl);
    if (!candidateId) { done++; return Promise.resolve(); }
    return sleep(DELAY_MS).then(function() {
      return get('https://myneta.info/WestBengal2026/candidate.php?candidate_id=' + candidateId);
    }).then(function(html) {
      var occ = extractOccupation(html);
      if (occ) { cand.occupation = occ; found++; }
    }).catch(function() {
      // ignore
    }).then(function() {
      done++;
      if (done % 100 === 0 || done === toFetch.length) {
        var elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        var eta = done < toFetch.length
          ? ((toFetch.length - done) * DELAY_MS / CONCURRENCY / 1000).toFixed(0) : '0';
        process.stdout.write('\r  ' + done + '/' + toFetch.length + ' | ' + found + ' found | ' + elapsed + 's | ~' + eta + 's left    ');
      }
    });
  };
});

console.log('\nFetching ' + toFetch.length + ' pages (concurrency ' + CONCURRENCY + ')...');
pool(tasks, CONCURRENCY).then(function() {
  console.log('\n');
  var total = candidates.filter(function(c) { return c.occupation && c.occupation !== 'Not declared'; }).length;
  console.log('With occupation: ' + total + '/' + candidates.length + ' (' + Math.round(total/candidates.length*100) + '%)');

  var samples = candidates.filter(function(c) { return c.occupation; }).slice(0, 15);
  console.log('\nSample:');
  samples.forEach(function(c) { console.log(' - ' + c.name + ': ' + c.occupation); });

  fs.writeFileSync(CANDIDATES_FILE, raw.replace(arrayMatch[2], JSON.stringify(candidates, null, 2)), 'utf8');
  console.log('\n✅ Written to src/data/candidates.ts');
});
