#!/usr/bin/env python3
"""Regenerate FactoryAI2U_Standalone.html by inlining CSS + JS modules.
Recipe: head (before <style>) is preserved verbatim from the existing standalone;
CSS goes in one <style>; data.js / calculators.js / main.js each in their own
<script>; embedded blob manifest + file://-aware inline service worker preserved.
"""
import re, io, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SA = os.path.join(ROOT, 'FactoryAI2U_Standalone.html')

with io.open(SA, encoding='utf-8') as fh:
    old = fh.read()

# 1) Head: everything up to (but not including) the first <style>
style_idx = old.index('<style>')
head = old[:style_idx]

# 2) Manifest blob script: capture the exact <script>...</script> that builds the blob manifest.
m = re.search(r'(<script>\s*\(function \(\) \{\s*try \{\s*var manifest =.*?</script>)', old, re.S)
manifest_script = m.group(1)

# 3) Service worker script: the file://-aware inline SW registration.
sw = re.search(r'(<script>\s*\(function \(\) \{\s*if \(!\(\'serviceWorker\' in navigator\)\) return;.*?</script>)', old, re.S)
sw_script = sw.group(1)

def rd(p):
    with io.open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()

css = rd('assets/styles.css')
data_js = rd('assets/data.js')
calc_js = rd('assets/calculators.js')
main_js = rd('assets/main.js')

body = (
    '<body>\n'
    '  <div id="app" aria-live="polite"></div>\n'
    '  <div id="net-banner" class="net-banner" hidden></div>\n'
    '  <div id="toast-host" class="toast-host" aria-live="assertive"></div>\n'
    '  <div id="modal-host" class="modal-host" hidden></div>\n\n'
    '  ' + manifest_script + '\n'
    '  <script>\n' + data_js + '\n  </script>\n'
    '  <script>\n' + calc_js + '\n  </script>\n'
    '  <script>\n' + main_js + '\n  </script>\n'
    '  ' + sw_script + '\n'
    '</body>\n</html>\n'
)

out = head + '<style>\n' + css + '\n  </style>\n' + body

with io.open(SA, 'w', encoding='utf-8') as fh:
    fh.write(out)

# ---- validation ----
so, sc = out.count('<script'), out.count('</script>')
assert so == sc, 'script tag mismatch: %d open vs %d close' % (so, sc)
assert 'assets/' not in out.replace('assets/styles','').replace('data-','') or out.count('assets/')==0, 'contains assets/ reference'
# strict assets/ check (ignore comments in JS that reference 'assets/*.js')
bad = [ln for ln in out.splitlines() if re.search(r'(src|href)\s*=\s*["\']assets/', ln)]
assert not bad, 'live assets/ src/href refs: %r' % bad[:3]
assert 'CORE 4.5' not in out, 'contains forbidden CORE 4.5'
for tok in ['recordEntryFor', 'masterForm', 'userForm', 'admRepaint', 'openProduction', 'bindOrg', '100dvh']:
    assert tok in out, 'missing expected token: ' + tok
print('OK bytes=%d scripts=%d/%d' % (len(out.encode('utf-8')), so, sc))
