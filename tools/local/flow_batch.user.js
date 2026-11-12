// ==UserScript==
// @name         ذره‌بین – ساخت خودکار تصویر در Google Flow
// @namespace    https://github.com/amirzadehes/zarrebin-video
// @version      0.1.5
// @description  تصویرهای کم‌داشته‌ی یک قسمت را در Flow می‌سازد (۴ تصویر برای هر پرامپت) و در inbox ریبو آپلود می‌کند
// @match        https://flow.google.com/*
// @match        https://labs.google/fx/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @connect      flow-content.google
// @connect      flow.google.com
// @connect      storage.googleapis.com
// @connect      googleusercontent.com
// @connect      labs.google
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';
  const OWNER = 'amirzadehes', REPO = 'zarrebin-video', BRANCH = 'main';
  const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const store = {
    get: (k, d) => { try { const v = GM_getValue(k); return v === undefined ? d : v; } catch (e) { return d; } },
    set: (k, v) => { try { GM_setValue(k, v); } catch (e) {} },
  };
  let STOP = false, RUNNING = false;

  /* ---------- رابط کاربری (Shadow DOM تا با استایل Flow قاطی نشود) ---------- */
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
  <style>
    *{box-sizing:border-box;font-family:Vazirmatn,Tahoma,sans-serif}
    .box{direction:rtl;width:330px;background:#17181c;color:#eee;border:1px solid #444;border-radius:12px;padding:10px;font-size:13px}
    .box.min{width:auto;padding:6px 10px;cursor:pointer}
    .box.min>*:not(.hd){display:none}
    .hd{display:flex;justify-content:space-between;align-items:center;font-weight:700;margin-bottom:6px}
    input{width:100%;margin:3px 0 7px;padding:6px;border-radius:6px;border:1px solid #555;background:#0e0f12;color:#fff;direction:ltr}
    label{display:block;opacity:.8;font-size:12px}
    .row{display:flex;gap:6px}.row>div{flex:1}
    button{padding:7px 10px;border-radius:8px;border:0;background:#2b6cff;color:#fff;cursor:pointer;font-size:13px}
    button.red{background:#c0392b}button.gray{background:#444}
    #log{height:150px;overflow:auto;background:#0e0f12;border-radius:6px;padding:6px;margin-top:7px;direction:ltr;text-align:left;font:11px/1.5 monospace;white-space:pre-wrap}
  </style>
  <div class="box" id="box">
    <div class="hd"><span>🖼 ذره‌بین ← Flow v0.1.5</span><span id="min" style="cursor:pointer">▁</span></div>
    <label>توکن گیت‌هاب (فقط همین‌جا ذخیره می‌شود)</label>
    <input id="tok" type="password" placeholder="github_pat_...">
    <label>نام پوشه‌ی قسمت (مثلاً saint-marin)</label>
    <input id="ep" placeholder="saint-marin">
    <div class="row">
      <div><label>حداکثر تعداد پرامپت</label><input id="lim" type="number" value="3" min="1"></div>
      <div><label>مکث بین پرامپت‌ها (ثانیه)</label><input id="pause" type="number" value="20" min="5"></div>
    </div>
    <div class="row">
      <button id="go">شروع</button>
      <button id="stop" class="red">توقف</button>
      <button id="q" class="gray">فهرست کمبودها</button>
    </div>
    <div id="log"></div>
  </div>`;
  document.documentElement.appendChild(host);
  const $ = s => root.querySelector(s);
  $('#tok').value = store.get('tok', '');
  $('#ep').value = store.get('ep', '');
  $('#lim').value = store.get('lim', 3);
  $('#pause').value = store.get('pause', 20);
  $('#min').onclick = () => $('#box').classList.toggle('min');
  $('#box').addEventListener('click', e => { if ($('#box').classList.contains('min')) { $('#box').classList.remove('min'); e.stopPropagation(); } }, true);
  const log = m => {
    const el = $('#log');
    el.textContent += `[${new Date().toLocaleTimeString('en-GB')}] ${m}\n`;
    el.scrollTop = el.scrollHeight;
    console.log('[zarrebin]', m);
  };

  /* ---------- ابزارهای شبکه ---------- */
  const gm = (opt) => new Promise((res, rej) => {
    GM_xmlhttpRequest({ timeout: 90000, ...opt, onload: res, onerror: e => rej(new Error('network ' + (opt.url || '').slice(0, 60))), ontimeout: () => rej(new Error('timeout')) });
  });
  const ghHeaders = (tok, extra) => ({ Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...extra });
  async function ghRaw(path, tok) {
    const r = await gm({ method: 'GET', url: API + path + '?ref=' + BRANCH, headers: ghHeaders(tok, { Accept: 'application/vnd.github.raw+json' }) });
    if (r.status === 404) return null;
    if (r.status !== 200) throw new Error(`GitHub ${r.status} برای ${path}` + (r.status === 401 ? ' (توکن اشتباه یا منقضی)' : ''));
    return r.responseText;
  }
  async function ghList(path, tok) {
    const r = await gm({ method: 'GET', url: API + path + '?ref=' + BRANCH, headers: ghHeaders(tok) });
    if (r.status === 404) return [];
    if (r.status !== 200) throw new Error(`GitHub ${r.status} برای فهرست ${path}`);
    return JSON.parse(r.responseText).map(x => x.name);
  }
  function b64(buf) {
    const u = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function ghPut(path, buf, msg, tok) {
    for (let a = 1; a <= 5; a++) {
      const r = await gm({ method: 'PUT', url: API + path, headers: ghHeaders(tok, { 'Content-Type': 'application/json' }), data: JSON.stringify({ message: msg, content: b64(buf), branch: BRANCH }) });
      if (r.status === 200 || r.status === 201) return true;
      if ([409, 422, 502, 503, 429].includes(r.status) && a < 5) { await sleep(1500 * a); continue; }
      throw new Error(`آپلود ناموفق (${r.status}) ${String(r.responseText).slice(0, 120)}`);
    }
  }
  async function sha256(buf) {
    const d = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- DOM: جست‌وجو در Shadow DOM ---------- */
  function deepAll(sel, rootNode = document) {
    const out = [];
    const walk = n => {
      try { n.querySelectorAll(sel).forEach(e => out.push(e)); } catch (e) {}
      let all = []; try { all = n.querySelectorAll('*'); } catch (e) {}
      all.forEach(e => { if (e.shadowRoot && e.shadowRoot !== host.shadowRoot) walk(e.shadowRoot); });
    };
    walk(rootNode);
    return out;
  }
  const visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const gridImgs = () => deepAll('flow-image-tile img.image').filter(i => i.src);

  function settingsText() {
    const b = deepAll('button.settings-trigger-button')[0];
    return b ? b.innerText.replace(/\s+/g, ' ') : '';
  }
  function promptBox() {
    return deepAll('div[role="textbox"].ProseMirror').find(visible) || deepAll('div[role="textbox"]').find(visible);
  }
  function startBtn() { return deepAll('button[aria-label="Start generation"]').find(visible); }

  async function typePrompt(text) {
    const box = promptBox();
    if (!box) throw new Error('کادر پرامپت پیدا نشد');
    box.focus(); await sleep(200);
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await sleep(150);
    let ok = document.execCommand('insertText', false, text);
    await sleep(300);
    const has = () => box.innerText.replace(/\s+/g, ' ').trim().startsWith(text.slice(0, 30).replace(/\s+/g, ' '));
    if (!ok || !has()) {
      // راه دوم: رویداد paste
      box.focus();
      document.execCommand('selectAll', false, null); document.execCommand('delete', false, null);
      const dt = new DataTransfer(); dt.setData('text/plain', text);
      box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await sleep(400);
    }
    if (!has()) throw new Error('متن در کادر پرامپت ننشست');
  }

  async function waitFor(fn, ms, step = 400) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (STOP) throw new Error('STOP'); const v = fn(); if (v) return v; await sleep(step); }
    return null;
  }

  const LIMIT_RE = /(quota|limit reached|too many|try again later|captcha|verify you|unusual traffic|out of credits|not enough credits|محدودیت)/i;
  function limitMessage() {
    const t = deepAll('snack-bar-container, mat-snack-bar-container, .mdc-snackbar, [role="alert"], [role="dialog"]').map(e => e.innerText || '').join(' ');
    return LIMIT_RE.test(t) ? t.replace(/\s+/g, ' ').slice(0, 160) : '';
  }

  /* ---------- یک پرامپت: تولید و گرفتن ۴ تصویر ---------- */
  async function generate(promptText) {
    const before = new Set(gridImgs().map(i => i.src));
    await typePrompt(promptText);
    const tilesBefore = deepAll('flow-image-tile').length;
    const spinSel = '[role="progressbar"], mat-progress-spinner, mat-spinner, mat-progress-bar, [class*="generating"], [class*="loading"], [class*="skeleton"], [class*="placeholder"]';
    const spinBefore = deepAll(spinSel).length;
    const boxEmpty = () => { const bx = promptBox(); return !!bx && bx.innerText.trim().length < 5; };
    const startedNow = () => deepAll('flow-image-tile').length > tilesBefore || gridImgs().some(i => !before.has(i.src)) || boxEmpty() || deepAll(spinSel).length > spinBefore || (() => { const b2 = startBtn(); return !b2 || b2.disabled || b2.getAttribute('aria-disabled') === 'true'; })();
    const btnState = () => { const b = startBtn(); return b ? `disabled=${b.disabled} aria-disabled=${b.getAttribute('aria-disabled')}` : 'دکمه پیدا نشد'; };
    let btn = await waitFor(() => { const b = startBtn(); return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' ? b : null; }, 8000);
    if (!btn) {
      // تلاش دوباره برای بیدار کردن ویرایشگر
      const box = promptBox(); box.focus();
      document.execCommand('insertText', false, ' '); await sleep(200); document.execCommand('delete', false, null);
      btn = await waitFor(() => { const b = startBtn(); return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' ? b : null; }, 6000);
    }
    log('وضعیت دکمه‌ی Start: ' + btnState());
    if (!btn) { dumpDiag('Start فعال نشد'); throw new Error('دکمه‌ی Start فعال نشد'); }
    const realClick = el => {
      const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
      for (const t of ['pointerover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        el.dispatchEvent(t.startsWith('pointer') ? new PointerEvent(t, { ...o, pointerId: 1, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(t, o));
      }
    };
    const tries = [
      ['کلیک ماوس', () => realClick(btn)],
      ['Enter روی خود دکمه', () => { btn.focus(); for (const t of ['keydown', 'keypress', 'keyup']) btn.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true })); }],
      ['Enter ساختگی در کادر', () => { const bx = promptBox(); bx.focus(); for (const t of ['keydown', 'keypress', 'keyup']) bx.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true })); }],
      ['insertParagraph (Enter مرورگر)', () => { const bx = promptBox(); bx.focus(); document.execCommand('insertParagraph', false, null); }],
    ];
    let started = false;
    for (const [name, fn] of tries) {
      log('تلاش: ' + name);
      try { fn(); } catch (e) { log('  خطا: ' + e.message); }
      if (await waitFor(startedNow, 8000, 500)) { started = true; log('  ✔ کار کرد: ' + name); store.set('startMethod', name); break; }
    }
    if (!started) { dumpDiag('ارسال پرامپت اثری نداشت (' + btnState() + ')'); throw new Error('Flow پرامپت را نپذیرفت'); }
    log('پرامپت فرستاده شد؛ منتظر تصویرها…');
    let dumped = false;

    // منتظر ظهور تصویرهای تازه؛ وقتی تعداد ۵ ثانیه ثابت ماند تمام است
    let last = -1, since = Date.now(), fresh = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      if (STOP) throw new Error('STOP');
      const lm = limitMessage(); if (lm) throw new Error('LIMIT: ' + lm);
      fresh = gridImgs().filter(i => !before.has(i.src) && i.complete && i.naturalWidth > 0);
      if (fresh.length !== last) { last = fresh.length; since = Date.now(); }
      if (fresh.length >= 4 && Date.now() - since > 4000) break;
      if (fresh.length > 0 && Date.now() - since > 25000) break;
      if (!dumped && Date.now() - t0 > 60000 && !fresh.length) { dumped = true; log('۶۰ ثانیه گذشت و تصویر تازه‌ای دیده نشد.'); dumpDiag('تصویر تازه پیدا نشد'); }
      await sleep(1000);
    }
    if (!fresh.length) throw new Error('تصویری ساخته نشد (زمان تمام شد)');
    // یکتا
    const seen = new Set(); fresh = fresh.filter(i => !seen.has(i.src) && seen.add(i.src));
    log(`${fresh.length} تصویر تازه`);
    return fresh;
  }

  /* ---------- باز کردن نمای بزرگ و گرفتن فایل کامل ---------- */
  const inGrid = img => { let n = img; while (n) { if (n.tagName === 'FLOW-IMAGE-TILE') return true; n = n.parentNode || n.host; } return false; };
  function bigImage() {
    const c = deepAll('img').filter(i => !inGrid(i) && i.currentSrc && i.naturalWidth >= 700 && visible(i) && i.getBoundingClientRect().width >= 150);
    c.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);
    return c[0];
  }
  function pressEsc() {
    for (const t of [document.activeElement, document.body, document]) {
      try { t && t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true })); } catch (e) {}
    }
  }
  async function closeDetail() {
    pressEsc();
    if (await waitFor(() => !bigImage(), 2500, 250)) return true;
    const b = deepAll('button').find(x => visible(x) && /^(close|back|arrow_back|navigate_before)$/i.test((x.getAttribute('aria-label') || x.innerText || '').trim().replace(/\s+/g, '')));
    if (b) { b.click(); if (await waitFor(() => !bigImage(), 2500, 250)) return true; }
    history.back();
    return !!(await waitFor(() => !bigImage() && gridImgs().length, 5000, 300));
  }
  async function fetchFull(tileImg) {
    tileImg.scrollIntoView({ block: 'center' }); await sleep(300);
    tileImg.click();
    const big = await waitFor(bigImage, 12000, 400);
    if (!big) {
      dumpDiag('نمای بزرگ باز نشد');
      throw new Error('نمای بزرگ باز نشد');
    }
    await sleep(600);
    const url = big.currentSrc;
    const r = await gm({ method: 'GET', url, responseType: 'arraybuffer', headers: { Accept: 'image/*' } });
    if (r.status !== 200) throw new Error('دانلود تصویر کامل ناموفق: ' + r.status);
    const buf = r.response;
    const u = new Uint8Array(buf.slice(0, 4));
    const isJpg = u[0] === 0xFF && u[1] === 0xD8, isPng = u[0] === 0x89 && u[1] === 0x50;
    if (!isJpg && !isPng) throw new Error('فایل دریافتی عکس نیست');
    const bmp = await createImageBitmap(new Blob([buf]));
    if (bmp.width < 600) throw new Error(`اندازه‌ی تصویر کوچک است (${bmp.width}×${bmp.height})`);
    const ext = isPng ? 'png' : 'jpg';
    const ok = await closeDetail();
    if (!ok) throw new Error('بستن نمای بزرگ ممکن نشد');
    await sleep(500);
    return { buf, ext, w: bmp.width, h: bmp.height };
  }
  function dumpDiag(why) {
    const info = {
      why, url: location.pathname.replace(/[0-9a-f-]{20,}/g, 'ID'),
      imgs: deepAll('img').filter(visible).slice(-6).map(i => ({ nat: i.naturalWidth + 'x' + i.naturalHeight, shown: Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height), cls: i.className, grid: inGrid(i) })),
      buttons: deepAll('button').filter(visible).slice(-14).map(b => ({ a: b.getAttribute('aria-label'), t: (b.innerText || '').slice(0, 25) })),
    };
    log('تشخیص:\n' + JSON.stringify(info));
  }

  /* ---------- برنامه‌ی اصلی ---------- */
  async function loadQueue(tok, ep) {
    const needsTxt = await ghRaw(`episodes/${ep}/needs.json`, tok);
    if (!needsTxt) throw new Error(`episodes/${ep}/needs.json پیدا نشد`);
    const needs = JSON.parse(needsTxt);
    const cat = JSON.parse(await ghRaw('library/catalog.json', tok));
    const items = cat.items || cat;
    const have = new Set(Object.keys(items).filter(k => (items[k].variants || []).length));
    const inbox = await ghList('inbox', tok);
    const pending = new Set(inbox.map(n => n.split('__')[0]));
    const recent = store.get('uploaded', {}); const now = Date.now();
    for (const k of Object.keys(recent)) if (now - recent[k] > 36 * 3600e3) delete recent[k];
    const queue = needs.items.filter(it => !have.has(it.id) && !pending.has(it.id) && !recent[it.id]);
    return { queue, total: needs.items.length, have: needs.items.filter(it => have.has(it.id)).length, recent };
  }
  async function loadTemplate(tok) {
    const html = await ghRaw('app/index.html', tok);
    const m = html.match(/const VAR_CLAUSE = "((?:[^"\\]|\\.)*)"/);
    if (!m || !m[1].includes('{subject}')) throw new Error('قالب پرامپت در app/index.html پیدا نشد');
    return JSON.parse('"' + m[1] + '"');
  }

  $('#q').onclick = async () => {
    try {
      const tok = $('#tok').value.trim(), ep = $('#ep').value.trim();
      if (!tok || !ep) return log('توکن و نام قسمت را وارد کن.');
      const { queue, total, have } = await loadQueue(tok, ep);
      log(`از ${total} مورد، ${have} تا در کتابخانه هست؛ ${queue.length} مورد کم است:\n` + queue.map(q => '• ' + q.id).join('\n'));
    } catch (e) { log('خطا: ' + e.message); }
  };
  $('#stop').onclick = () => { STOP = true; log('درخواست توقف ثبت شد؛ بعد از مرحله‌ی جاری می‌ایستد.'); };
  $('#go').onclick = async () => {
    if (RUNNING) return log('در حال اجراست.');
    RUNNING = true; STOP = false;
    try {
      const tok = $('#tok').value.trim(), ep = $('#ep').value.trim();
      const lim = Math.max(1, +$('#lim').value || 1), pause = Math.max(5, +$('#pause').value || 20);
      if (!tok || !ep) throw new Error('توکن و نام قسمت را وارد کن.');
      store.set('tok', tok); store.set('ep', ep); store.set('lim', lim); store.set('pause', pause);

      const st = settingsText();
      log('تنظیمات Flow: ' + st);
      if (!/crop_9_16/.test(st) || !/x4/i.test(st)) throw new Error('در Flow باید نسبت ۹:۱۶ و تعداد x4 انتخاب شده باشد. اول آن‌ها را درست کن.');

      const tpl = await loadTemplate(tok);
      const { queue, recent } = await loadQueue(tok, ep);
      if (!queue.length) { log('✅ چیزی کم نیست.'); return; }
      log(`${queue.length} مورد کم است؛ این دور حداکثر ${lim} تا.`);

      let fails = 0, done = 0;
      for (const it of queue) {
        if (STOP || done >= lim) break;
        log(`▶ ${it.id}`);
        try {
          const prompt = tpl.replace('{subject}', it.en);
          const tiles = await generate(prompt);
          const hashes = new Set(); let up = 0;
          for (let k = 0; k < tiles.length; k++) {
            if (STOP) break;
            try {
              const f = await fetchFull(tiles[k]);
              const h = await sha256(f.buf);
              if (hashes.has(h)) { log('  تکراری، رد شد'); continue; }
              hashes.add(h);
              const name = `inbox/${it.id}__${Date.now().toString(36)}${k}.${f.ext}`;
              await ghPut(name, f.buf, `inbox: ${it.id} (flow)`, tok);
              up++; log(`  ✔ ${k + 1}/${tiles.length} آپلود شد (${f.w}×${f.h})`);
            } catch (e) {
              if (e.message === 'STOP' || /^LIMIT/.test(e.message)) throw e;
              log(`  ✖ تصویر ${k + 1}: ${e.message}`);
            }
          }
          if (up) { recent[it.id] = Date.now(); store.set('uploaded', recent); done++; fails = 0; }
          else throw new Error('هیچ تصویری آپلود نشد');
        } catch (e) {
          if (e.message === 'STOP') break;
          if (/^LIMIT/.test(e.message)) { log('⛔ ' + e.message + '\nمتوقف شد؛ بعداً دوباره اجرا کن.'); break; }
          fails++; log(`خطا در ${it.id}: ${e.message}`);
          if (fails >= 3) { log('⛔ سه خطای پشت‌سرهم؛ متوقف شد.'); break; }
        }
        if (!STOP && done < lim) { log(`مکث ${pause} ثانیه…`); for (let s = 0; s < pause && !STOP; s++) await sleep(1000); }
      }
      log(`پایان. ${done} مورد انجام شد. چند دقیقه بعد workflow «process-inbox» خودکار عکس‌ها را وارد کتابخانه می‌کند.`);
    } catch (e) { log('خطا: ' + e.message); }
    finally { RUNNING = false; }
  };
  log('آماده. اول «فهرست کمبودها» را بزن.');
})();
