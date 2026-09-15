# Livelihood Assistance Monitoring System — front-end redesign handoff

Deliverable as requested: **new CSS blocks + the minimal HTML/JS changes needed**, nothing more.

| File | Replaces |
|---|---|
| `handoff/app.css` | the `<style>` block in `index.html` |
| `handoff/auth.css` | the `<style>` blocks in `login.html` **and** `admin-login.html` |
| `handoff/admin.css` | the `<style>` block in `admin.html` |
| `assets/icons.js` | your `icons.js` — two icons added (`chevron-right`, `search`) |

Mobile-first, `min-width` breakpoints at **560 / 768 / 1024 / 1280px**, plus a short-landscape rule. Offline-safe: no CDN, no build step, Inter and the Lucide subset stay self-hosted. Every ID/class your JS queries is preserved.

Visual mockups of the result: `Livelihood Monitoring Redesign.dc.html` (pixel-faithful recreation of today's build for comparison: `Current System (Recreation).dc.html`).

---

## 1. Keep the file loading one stylesheet

Either paste the file contents back into the `<style>` block, or (preferred) serve it:

```html
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/app.css">
```

`routes/pages.js` already serves static files from the project root, so `/app.css` needs no new route.

---

## 2. Minimal HTML changes — `index.html`

**2.1 Wrap the shell (required for the desktop sidebar).** One wrapper, no reordering:

```html
<body>
<div class="app-shell">          <!-- NEW -->
  <div class="app-topbar"> … header.appbar + nav.tabs unchanged … </div>
  <main> … </main>
</div>                            <!-- NEW -->
```

Below 1024px `.app-shell` is a column (top bar + fixed bottom tab bar). At ≥1024px it becomes a row and `.app-topbar` *is* the sidebar — `nav.tabs` flips from a bottom tab bar to vertical nav with no markup change. **The hamburger is gone**: mobile navigation is a 4-up bottom bar, which removes the `nav-open` / outside-tap / close-on-select problems entirely. You can delete `#btnMenuToggle`, its listener, and the `.nav-open` class handling. `.nav-account-mobile` stays in the markup — it is hidden on mobile (Admin/Log out live in the top bar) and shown in the sidebar footer on desktop.

**2.2 Give the Yes/No cells a label** (one line in `buildStatusTable()`), so the indicator table can reflow to cards:

```js
<td class="center" data-label="Yes"><input type="radio" name="stat_${i}" value="yes"></td>
<td class="center" data-label="No"><input type="radio" name="stat_${i}" value="no"></td>
```

**2.3 Wizard (Details → Status → Business → Needs → Signatures).** Add `class="wizard-step" data-step="N"` to the existing `.card` blocks inside `#tab-form` — do not move or rename anything inside them:

| `data-step` | cards |
|---|---|
| 1 | Beneficiary & Assistance Details |
| 2 | I. Status of Livelihood |
| 3 | II. Business Information |
| 4 | III. Challenges, IV. Assistance Needed, V. Observations, VI. Recommendations, Beneficiary's Feedback |
| 5 | Signatures |

Then insert the rail before the first card and swap the final `.btnrow` for the sticky action bar:

```html
<div class="wizard-rail" id="wizardRail">
  <div class="wz-head">
    <span class="wz-title" id="wzTitle">Details</span>
    <span class="wz-count" id="wzCount">Step 1 of 5</span>
  </div>
  <div class="wz-track"><div class="wz-fill" id="wzFill" style="width:20%"></div></div>
  <div class="wz-steps" id="wzSteps"></div>
</div>

<div class="wizard-actions">
  <button class="secondary" id="btnStepPrev" data-icon="chevron-left">Back</button>
  <span class="spacer"></span>
  <button class="secondary" id="btnSaveRecord" data-icon="save">Save Record</button>
  <button class="primary"   id="btnStepNext" data-icon="chevron-right">Next</button>
  <button class="primary"   id="btnGenerate" data-icon="file-check" hidden>Generate Document</button>
</div>
```

`#btnSaveRecord` and `#btnGenerate` keep their IDs, so `collectFormData()` / `renderDocument()` / `apiSaveRecord()` are untouched. `#btnClearForm` can move into the step-1 card or a small overflow menu — your call.

**2.4 Preview tab** — add the height-reserving box and the zoom control:

```html
<div class="preview-toolbar">
  … existing Print / DOCX / Back buttons …
  <div class="zoom-group" id="zoomGroup">
    <button type="button" class="active" data-zoom="fit">Fit width</button>
    <button type="button" data-zoom="actual">100%</button>
  </div>
</div>
<div class="docsheet-wrap" id="docSheetWrap">
  <div class="docsheet-box" id="docSheetBox">   <!-- NEW: reserves scaled height -->
    <div id="docSheet"></div>
  </div>
</div>
<p class="docsheet-note">Scaled to fit the screen. Printing still uses the true A4 geometry.</p>
```

**2.5 Signature pad** — drop the fixed `width`/`height` attributes; JS sets the backing store:

```html
<div class="sig-pad-wrap"><canvas id="benSigPad" class="sig-pad"></canvas></div>
```

**2.6 Optional** — add `<span class="card-eyebrow">Section III</span>` above a `.card h2` where the Roman numerals help; the old `border-left` rule on `h2` is gone in favour of spacing and weight.

---

## 3. Minimal JS additions — `index.html`

Four small blocks. Everything else (records, dashboard, DOCX, auth, escapeHtml) is unchanged.

**3.1 Wizard**

```js
const WZ = [
  {n:1, t:'Details'}, {n:2, t:'Status'}, {n:3, t:'Business'},
  {n:4, t:'Needs'},   {n:5, t:'Signatures'}
];
let wzStep = 1;

document.getElementById('wzSteps').innerHTML = WZ.map(s =>
  `<button type="button" class="wz-step" data-go="${s.n}">
     <span class="n">${s.n}</span><span class="t">${s.t}</span>
   </button>`).join('');

function showStep(n){
  wzStep = Math.max(1, Math.min(WZ.length, n));
  document.querySelectorAll('#tab-form .wizard-step').forEach(el=>{
    el.hidden = Number(el.dataset.step) !== wzStep;
  });
  document.querySelectorAll('#wzSteps .wz-step').forEach(el=>{
    const i = Number(el.dataset.go);
    el.classList.toggle('is-current', i === wzStep);
    el.classList.toggle('is-done', i < wzStep);
    el.querySelector('.n').textContent = i < wzStep ? '\u2713' : i;
  });
  document.getElementById('wzTitle').textContent = WZ[wzStep-1].t;
  document.getElementById('wzCount').textContent = `Step ${wzStep} of ${WZ.length}`;
  document.getElementById('wzFill').style.width = (wzStep / WZ.length * 100) + '%';
  document.getElementById('btnStepPrev').disabled = wzStep === 1;
  document.getElementById('btnStepNext').hidden = wzStep === WZ.length;
  document.getElementById('btnGenerate').hidden = wzStep !== WZ.length;
  window.scrollTo(0, 0);      // never scrollIntoView — it fights the sticky bars
}
document.getElementById('wzSteps').addEventListener('click', e=>{
  const b = e.target.closest('.wz-step'); if(b) showStep(Number(b.dataset.go));
});
document.getElementById('btnStepPrev').addEventListener('click', ()=>showStep(wzStep-1));
document.getElementById('btnStepNext').addEventListener('click', ()=>showStep(wzStep+1));
showStep(1);
```

`loadFormData()` already fills every field regardless of which step is visible; call `showStep(1)` at the end of `loadFormData()` and `clearForm()`.

**3.2 Document preview — fit-to-width scaling**

```js
let sheetZoom = 'fit';
function fitDocSheet(){
  const wrap = document.getElementById('docSheetWrap');
  const box  = document.getElementById('docSheetBox');
  if(!wrap || !box) return;
  const avail = wrap.clientWidth - 24;                  // minus .docsheet-wrap padding
  const scale = sheetZoom === 'actual' ? 1 : Math.min(1, Math.max(0.28, avail / 794));
  wrap.style.setProperty('--sheet-scale', scale);
  wrap.classList.toggle('is-actual-size', sheetZoom === 'actual');
  box.style.height = (docSheetHeight() * scale) + 'px';
}
function docSheetHeight(){
  const el = document.getElementById('docSheet');
  return Math.max(1123, el.scrollHeight || 1123);       // A4 at 96dpi, or taller
}
document.getElementById('zoomGroup').addEventListener('click', e=>{
  const b = e.target.closest('[data-zoom]'); if(!b) return;
  sheetZoom = b.dataset.zoom;
  document.querySelectorAll('#zoomGroup button').forEach(x=>x.classList.toggle('active', x === b));
  fitDocSheet();
});
window.addEventListener('resize', fitDocSheet);
window.addEventListener('orientationchange', fitDocSheet);
```

Call `fitDocSheet()` at the end of `renderDocument()` and in `switchTab('preview')`. Print output is unaffected: the print block resets `--sheet-scale` to 1 and clears the transform.

**3.3 Signature pad — resize without distorting or clipping**

```js
function resizeSigPad(){
  const rect = sigCanvas.getBoundingClientRect();
  if(!rect.width) return;
  const dpr  = window.devicePixelRatio || 1;
  const w = Math.round(rect.width  * dpr);
  const h = Math.round(rect.height * dpr);
  if(sigCanvas.width === w && sigCanvas.height === h) return;
  const prev = sigHasContent ? sigCanvas.toDataURL('image/png') : null;
  sigCanvas.width = w; sigCanvas.height = h;
  sigCtx.setTransform(dpr, 0, 0, dpr, 0, 0);            // draw in CSS pixels
  if(prev){
    const img = new Image();
    img.onload = ()=>sigCtx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = prev;
  }
}
window.addEventListener('resize', resizeSigPad);
window.addEventListener('orientationchange', ()=>setTimeout(resizeSigPad, 150));
resizeSigPad();
```

With `setTransform(dpr,…)` in place, change `sigCanvasPos()` to plain CSS-pixel coordinates:

```js
function sigCanvasPos(e){
  const r = sigCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
```

`getSignatureDataUrl()` / `loadSignatureDataUrl()` keep working — `loadSignatureDataUrl` should draw into CSS-pixel dimensions (`rect.width`, `rect.height`) rather than `canvas.width/height`.

**3.4 Records list** — no JS change required; `renderRecordsList()` output restyles itself. If you want the dot inside the status pill, wrap the label: `<span class="status-pill status-ok"><span class="dot"></span>…</span>` (purely cosmetic).

---

## 4. Scroll vs reflow — the two decisions you asked me to call out

**`table.indicators` (the Yes/No entry table) → REFLOW to cards below 1024px.**
It is an *input* surface, not a document. Horizontally scrolling to reach a 22px radio is the worst possible interaction on a phone held one-handed during a field visit, and a scrolled table hides the remarks column that staff type into most. Below 1024px each indicator becomes a card: statement on top, a two-up Yes/No segmented control at 44px, remarks input full width. Nothing is hidden and nothing needs scrolling. Note the breakpoint is **1024px, not 640px** — with the 252px sidebar, the four-column table only genuinely fits from about 1120px of window width, so tablets get cards too.

**`table.doc-table` inside `#docSheet` → stays TABULAR; the whole sheet is SCALED.**
This one mirrors the official DOCX. Reflowing it would produce a preview that doesn't match the print, which defeats the purpose of the tab. So the table is untouched and the *sheet* is scaled with `transform: scale()`; `.docsheet-box` reserves the scaled height so the page flow stays correct, and a "Fit width / 100%" toggle lets staff zoom in to proof a value (in 100% mode the wrapper scrolls, which is the one place horizontal scroll is the right answer — a deliberate, labelled zoom). At 375px the sheet renders at ~0.44×; still legible for checking, and printing is byte-identical to before.

The saved-records list already reflows (cards on mobile, row layout ≥768px), so it needs neither.

---

## 5. What changed visually, and why

- **Navigation.** Left sidebar ≥1024px (nav stops competing with the page title, and the 4 tabs no longer sit in a scrolling strip); bottom tab bar on mobile with 60px targets. Sticky chrome now costs ~52px of vertical space on mobile instead of ~96px — landscape phones fit a real form.
- **Touch targets.** `.tab-btn`, `.primary/.secondary/.danger`, `.pagination-bar button`, filter inputs and table inputs are all ≥44px; icon-only actions are 44×44 squares.
- **Contrast (WCAG AA).** The old `--muted:#48525c` was used for 12px labels. It is now a 3-step ink ramp — `--text #101a17` (16:1), `--text-2 #33433d` (10:1, all small labels), `--muted #475a53` (7.6:1, secondary copy), `--faint #6b7d76` (4.6:1, 13px+ hints only). `--accent` for text is darkened to `--accent-dark #a32d20` (5.3:1). Sidebar ink on `--navy-dark` is 5.2–7:1.
- **Rhythm and elevation.** One 4px spacing scale (`--s1`…`--s8`), one radius set, one shadow (`--shadow-2`) on all cards — no more mixed 8/10px radii and per-card shadows. The `border-left: 4px` rule on every `h2` is gone; hierarchy comes from size, weight and space, which is what made ten identical cards hard to scan.
- **Dashboard.** Fewer, bigger charts: three KPI tiles (one lead tile in emerald), one grouped-column chart for amount-vs-beneficiaries per year, one bar list for barangays, one stacked bar + legend for business status, one bar list for project types. Bar labels now sit **above** the bar (`.hbar-row` is `display:block`), so the fixed 150px/90px label column — and the truncated barangay names — are gone. Year labels rotate −45° below 400px so they can't collide.
- **Form.** Five steps, sticky action bar, real tappable checkbox/radio cards, a ₱ prefix on the amount field, and a fluid 3:1 signature pad.
- **Palette.** Emerald kept as you asked. `--navy*` token names are unchanged so nothing downstream breaks — but they are green; consider renaming to `--primary*` in a later pass.

## 6. Test matrix

| Width | Expected |
|---|---|
| 320px | single column; tab bar 4-up; indicator cards; sheet ≈0.37×; no horizontal scroll anywhere |
| 375px | as above, sheet ≈0.44× |
| 768px | two-up form grid + checkbox grid; record rows horizontal; still bottom tabs |
| 1024px | sidebar appears; 5-up wizard stepper; indicator cards (table needs ~1120px) |
| 1280px+ | wider gutters; content capped at 1180px; indicator table in four columns |

Also verify: print preview (one clean page, letterhead + footer intact), rotate a phone mid-signature (stroke survives), and a record with a very long barangay name (wraps, never truncates).
