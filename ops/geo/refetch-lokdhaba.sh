#!/bin/sh
# Re-acquire the 62 Lokdhaba source files and prove they are the same bytes the registry was built from.
#
# The registry lost each constituency's real per-delimitation name at import (see
# docs/model/electoral-geography.md). The names are reconstructible from these files — but a
# reconstruction is only defensible if it runs against the SAME bytes that produced the rows being
# corrected. Every `source` row for Lokdhaba carries hash_kind='document_bytes' and a sha256 over the
# gzip exactly as received, so that check is possible: this script fetches each URL and compares.
#
# A file whose hash no longer matches is NOT an error to be worked around — it means upstream changed
# the file, and the reconstruction for that state has to be reported as running against different bytes
# than the original import. Such files are listed separately and are the reviewer's decision.
#
# Input:  a TSV of source_id, url, doc_hash (one per line).
# Output: .data/cache/lokdhaba/<basename>, plus a manifest recording match/mismatch per file.
set -eu

TSV="${1:-/tmp/lokdhaba-sources.tsv}"
DIR=".data/cache/lokdhaba"
MANIFEST="$DIR/refetch-manifest.tsv"

mkdir -p "$DIR"
: > "$MANIFEST"

ok=0
drift=0
fail=0

while IFS="$(printf '\t')" read -r id url want; do
  [ -n "$url" ] || continue
  out="$DIR/$(basename "$url")"
  if ! curl -fsSL --retry 3 --retry-delay 2 --max-time 180 -o "$out" "$url"; then
    printf '%s\t%s\tFETCH_FAILED\t\n' "$id" "$url" >> "$MANIFEST"
    fail=$((fail + 1))
    echo "FETCH_FAILED $url" >&2
    continue
  fi
  got="$(shasum -a 256 "$out" | cut -d' ' -f1)"
  if [ "$got" = "$want" ]; then
    printf '%s\t%s\tMATCH\t%s\n' "$id" "$out" "$got" >> "$MANIFEST"
    ok=$((ok + 1))
  else
    printf '%s\t%s\tHASH_DRIFT\t%s\n' "$id" "$out" "$got" >> "$MANIFEST"
    drift=$((drift + 1))
    echo "HASH_DRIFT $url recorded=$want got=$got" >&2
  fi
done < "$TSV"

echo "match=$ok drift=$drift failed=$fail  manifest=$MANIFEST"
