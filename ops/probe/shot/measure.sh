#!/bin/zsh
# usage: measure.sh <saved.html> <width> <height> <css-selector> [<css-selector> ...]
# Loads a page saved by ops/probe/shot/shot.mjs in chrome-headless-shell at width x height, and prints the bounding
# box (x, y, w, h, in CSS px, document coordinates) of the first element each selector matches, plus the page's
# scrollWidth against clientWidth (horizontal overflow). No server needed: it injects a script into a COPY of the page.
html=${1:?saved html}; w=${2:?width}; h=${3:?height}; shift 3
bin=$(ls -d ~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell | sort | tail -1)
copy=$(mktemp /tmp/measure.XXXXXX.html)
sels=$(printf '"%s",' "$@"); sels="[${sels%,}]"
{ cat "$html"; cat <<JS
<script>
(function(){
  var out = {};
  $sels.forEach(function(s){
    var e = document.querySelector(s);
    if (!e) { out[s] = null; return; }
    var r = e.getBoundingClientRect();
    out[s] = {x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height)};
  });
  out.overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  out.scrollWidth = document.documentElement.scrollWidth; out.clientWidth = document.documentElement.clientWidth;
  document.documentElement.setAttribute('data-measure', JSON.stringify(out));
})();
</script>
JS
} > "$copy"
"$bin" --no-sandbox --disable-gpu --hide-scrollbars --window-size=$w,$h --dump-dom --timeout=3000 "file://$copy" 2>/dev/null | grep -o 'data-measure="[^"]*"' | head -1 | sed 's/data-measure="//; s/"$//; s/&quot;/"/g'
rm -f "$copy"
