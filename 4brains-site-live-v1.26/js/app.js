/* ==========================================================================
   app.js — renders the page from window.SITE (data.js) and wires the
   catalogue filters, detail view, video buttons, Present mode, the brief
   form and the QR codes. You should not need to edit this to change content.

   Sections: 1 utilities · 2 render slots (empty "3D RENDER HERE" / image /
   video / 3D hook) · 3 video buttons + modal · 4 strip, hero, intro
   5 expertise · 6 catalogue · 7 detail dialog · 8 work + big hits · 9 process
   10 proof · 11 contact + QR · 12 footer · 13 present mode · 14 motion,
   nav, routing, service worker · 15 boot
   ========================================================================== */
(function () {
  'use strict';

  const S = window.SITE, QR = window.QR;
  if (!S) { console.error('data.js did not load — window.SITE is missing'); return; }
  document.documentElement.classList.add('js');

  /* ---------- 1. utilities -------------------------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = n => String(n).padStart(2, '0');
  const pad3 = n => String(n).padStart(3, '0');
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ICON = {
    arrowUp: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13L13 3M6 3h7v7"/></svg>',
    arrow: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
    play: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg>',
    mail: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="14" height="10" rx="2"/><path d="M2.5 5l6.5 5 6.5-5"/></svg>',
    phone: '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M4 2h3l1.5 4-2 1.5a9 9 0 004 4L12 9.5 16 11v3a1.5 1.5 0 01-1.6 1.5A13 13 0 012.5 3.6 1.5 1.5 0 014 2z"/></svg>',
    menu: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14"/></svg>',
  };

  // Activities in display order: group order (data.js → groups), then file order
  const groupOrder = S.groups.map(g => g.id);
  const groupsById = Object.fromEntries(S.groups.map(g => [g.id, g]));
  const ACTS = S.activities.slice().sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group));
  const byGroup = id => ACTS.filter(a => a.group === id);
  const actById = Object.fromEntries(ACTS.map(a => [a.id, a]));
  const indexInGroup = a => byGroup(a.group).indexOf(a) + 1;

  function toast(msg) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('is-visible');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('is-visible'), 2400);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Copied'); } catch (err) { toast('Select and copy the text'); }
      ta.remove();
    }
  }

  /* ---------- 2. render slots ----------------------------------------------
     The hero visual of every activity. `a.visual.type` decides what renders:
       placeholder  → an empty framed space saying "3D RENDER HERE" + filename
       image        → assets/renders/<id>.webp (src), optional alt
       video        → mp4/webm (src) + poster; plays only in live slots
       model        → .glb via <model-viewer> if that script is loaded, else poster
     A custom hook can take over: window.RENDER_HOOKS[id] = (slotEl, {live}) => {}
  ------------------------------------------------------------------------- */
  function placeholderHTML(label, file, hint) {
    return `<div class="slot__ph"><span>${esc(hint || 'Placeholder')}</span><strong>${esc(label)}</strong><small>${esc(file)}</small></div>`;
  }
  function slotHTML(a, live, opts) {
    opts = opts || {};
    const v = a.visual || { type: 'placeholder' };
    const alt = esc(v.alt || `${a.name} — render`);
    let inner = '', empty = false;
    if (v.type === 'image' && v.src) {
      inner = `<img src="${esc(v.src)}" alt="${alt}" loading="lazy" decoding="async">`;
    } else if (v.type === 'video' && v.src) {
      inner = live
        ? `<video autoplay muted loop playsinline preload="metadata" ${v.poster ? `poster="${esc(v.poster)}"` : ''}><source src="${esc(v.src)}" type="${esc(v.mime || 'video/mp4')}"></video>`
        : (v.poster ? `<img src="${esc(v.poster)}" alt="${alt}" loading="lazy" decoding="async">` : '');
      if (!inner) empty = true;
    } else if (v.type === 'model' && v.src) {
      const hasMV = window.customElements && window.customElements.get('model-viewer');
      inner = (hasMV && live)
        ? `<model-viewer class="slot__media" src="${esc(v.src)}" ${v.poster ? `poster="${esc(v.poster)}"` : ''} auto-rotate camera-controls disable-zoom shadow-intensity="1" exposure="0.9" alt="${alt}"></model-viewer>`
        : (v.poster ? `<img src="${esc(v.poster)}" alt="${alt}" loading="lazy" decoding="async">` : '');
      if (!inner) empty = true;
    } else { empty = true; }
    if (empty) inner = placeholderHTML(opts.label || '3D render here', opts.file || `assets/renders/${a.id}.webp`, opts.hint || 'Placeholder');
    const badge = a.concept ? `<span class="slot__badge tag">Concept</span>` : '';
    return `<div class="slot ${empty ? 'slot--empty' : ''} ${live ? 'slot--live' : ''}" data-slot="${esc(a.id)}">${inner}${badge}</div>`;
  }
  function runRenderHooks(root) {
    const hooks = window.RENDER_HOOKS || {};
    $$('[data-slot]', root).forEach(el => {
      const fn = hooks[el.getAttribute('data-slot')];
      if (typeof fn === 'function') { try { fn(el, { live: el.classList.contains('slot--live') }); } catch (e) { console.warn('render hook failed', e); } }
    });
  }

  /* ---------- 3. video buttons + modal ----------------------------------------
     `video` (public): .mp4/.webm → in-page player; YouTube → embedded player;
     anything else (Instagram, Vimeo page…) → opens in a new tab.
     `videoInternal` (SharePoint / Drive): shown only in Present mode.          */
  const isFileVideo = u => /\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(u);
  function driveId(u) { const m = String(u).match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/); return m ? m[1] : null; }
  function youtubeId(u) {
    const m = String(u).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/))([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  }
  function videoButton(item, opts) {
    opts = opts || {};
    const title = item.name || '';
    if (item.video) {
      const embeddable = isFileVideo(item.video) || youtubeId(item.video) || driveId(item.video);
      return embeddable
        ? `<button class="vbtn ${opts.cls || ''}" type="button" data-video="${esc(item.video)}" data-title="${esc(title)}">${ICON.play} Watch video</button>`
        : `<a class="vbtn ${opts.cls || ''}" href="${esc(item.video)}" target="_blank" rel="noopener">${ICON.play} Watch video ${ICON.arrowUp}</a>`;
    }
    let out = `<span class="vbtn vbtn--soon ${opts.cls || ''}" title="Video will be added here">Video coming soon</span>`;
    if (opts.internal && item.videoInternal) out += `<a class="vbtn vbtn--ghost" href="${esc(item.videoInternal)}" target="_blank" rel="noopener" title="Opens on SharePoint / Drive — team login required">Internal video ${ICON.arrowUp}</a>`;
    return out;
  }
  let vmodal;
  function openVideo(url, title) {
    if (!vmodal) {
      vmodal = document.createElement('dialog'); vmodal.className = 'vmodal'; vmodal.setAttribute('aria-label', 'Video');
      document.body.appendChild(vmodal);
      vmodal.addEventListener('close', () => { vmodal.innerHTML = ''; });
      vmodal.addEventListener('click', e => { if (e.target === vmodal) vmodal.close(); });
    }
    const yt = youtubeId(url), dr = driveId(url);
    const media = yt
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${esc(yt)}?autoplay=1&rel=0" title="${esc(title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`
      : dr
        ? `<iframe src="https://drive.google.com/file/d/${esc(dr)}/preview" title="${esc(title)}" allow="autoplay; fullscreen" allowfullscreen loading="lazy"></iframe>`
        : `<video src="${esc(url)}" controls autoplay playsinline></video>`;
    vmodal.innerHTML = `<div class="vmodal__panel"><div class="vmodal__media">${media}</div>
      <div class="vmodal__bar"><strong>${esc(title)}</strong><div class="row"><a class="copy-btn" href="${esc(url)}" target="_blank" rel="noopener">Open ${ICON.arrowUp}</a><button class="copy-btn" type="button" data-close>Close</button></div></div></div>`;
    $('[data-close]', vmodal).addEventListener('click', () => vmodal.close());
    vmodal.showModal();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-video]'); if (!b) return;
    e.preventDefault(); openVideo(b.getAttribute('data-video'), b.getAttribute('data-title') || 'Video');
  });

  /* ---------- 4. strip, hero, intro ------------------------------------- */
  function renderStrips() { /* the marquee strip is retired in layout v2 */ }
  function renderHero() {
    const h = S.hero;
    $('#hero-eyebrow').textContent = h.eyebrow || ''; $('#hero-eyebrow').hidden = !h.eyebrow;
    $('#hero-title').innerHTML = h.title;                // trusted content from data.js (may contain <em>)
    $('#hero-sub').textContent = h.subline;
    $('#hero-ctas').innerHTML = `<a class="btn btn--mint" href="${esc(h.primaryCta.href)}">${esc(h.primaryCta.label)} ${ICON.arrow}</a>
      <a class="btn btn--ghost" href="${esc(h.secondaryCta.href)}">${esc(h.secondaryCta.label)}</a>`;
    const hv = h.visual || {};
    if ($('#hero-render')) $('#hero-render').innerHTML = `<div class="frame">${slotHTML({ id: 'hero', name: 'Hero', visual: hv }, true, { label: 'Hero render here', file: 'assets/renders/hero.webp' })}</div>`.replace('loading="lazy"', 'loading="eager" fetchpriority="high"');
    $('#hero-stats').innerHTML = S.stats.map(st => statHTML(st).replace('class="stat"', 'class="stat reveal"')).join('');
    // one orchestrated entrance; the title's characters sharpen into place
    splitChars($('#hero-title'));
    window.setTimeout(() => { document.documentElement.classList.add('hero-in'); $('#hero-title').classList.add('is-in'); }, 60);
  }
  // numbers count up once, when they come into view
  function countUp(el) {
    if (el.dataset.done) return; el.dataset.done = '1';
    const target = Number(el.dataset.count), suffix = el.dataset.suffix || '';
    const fmt = n => n.toLocaleString('en-IN');
    if (reducedMotion()) { el.textContent = fmt(target) + suffix; return; }
    const t0 = performance.now(), dur = 1100;
    const tick = now => { const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3); el.textContent = fmt(Math.round(target * e)) + suffix; if (t < 1) requestAnimationFrame(tick); };
    el.textContent = '0' + suffix; requestAnimationFrame(tick);
  }
  function statHTML(st) {
    const m = String(st.value).match(/^([\d,]+)(.*)$/);
    const num = m ? Number(m[1].replace(/,/g, '')) : null, suffix = m ? m[2] : '';
    return `<div class="stat"><strong ${num !== null ? `data-count="${num}" data-suffix="${esc(suffix)}"` : ''}>${esc(st.value)}</strong><span>${esc(st.label)}</span></div>`;
  }
  function initCounters() {
    const els = $$('#hero-stats [data-count]'); if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach(countUp); return; }
    const io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); countUp(en.target); } }), { threshold: 0.6 });
    els.forEach(el => io.observe(el));
  }
  // six families as an index: hover (or focus) a row and the preview changes;
  // left alone, it cycles slowly so the section is never still
  function groupCover(g) { const items = byGroup(g.id); return actById[g.cover] || items.find(a => a.visual && a.visual.type === 'image') || items[0]; }
  function renderFamilies() {
    const xp = $('#family-xp'); if (!xp) return;
    if ($('#families-title')) $('#families-title').textContent = (S.families && S.families.title) || 'The work.';
    xp.innerHTML = S.groups.map((g, i) => {
      const c = groupCover(g), v = (c && c.visual) || {}, n = byGroup(g.id).length;
      return `<a class="xp__card${i === 0 ? ' is-open' : ''}" href="#catalogue" data-family="${esc(g.id)}" style="--i:${i}" role="listitem" aria-label="${esc(g.name)}: ${esc(g.tagline)} ${n} experiences.">
        ${v.type === 'image' && v.src ? `<img src="${esc(v.src)}" alt="" loading="eager" decoding="async">` : ''}
        <span class="xp__n">${pad2(i + 1)}</span>
        <span class="xp__vname" aria-hidden="true">${esc(g.name)}</span>
        <span class="xp__body"><span class="xp__name">${esc(g.name)}</span><span class="xp__tag">${esc(g.tagline)}</span><span class="xp__count">${n} ${n === 1 ? 'experience' : 'experiences'} ${ICON.arrow}</span></span>
      </a>`;
    }).join('');
    const cards = $$('.xp__card', xp);
    let cur = 0, hovering = false, visible = false, timer = 0;
    const open = i => { if (i === cur) return; cur = i; cards.forEach((c, k) => c.classList.toggle('is-open', k === i)); };
    const cycle = () => {
      clearInterval(timer); timer = 0;
      if (reducedMotion() || hovering || !visible) return;
      timer = setInterval(() => open((cur + 1) % cards.length), (S.families && S.families.cycleMs) || 4200);
    };
    cards.forEach((c, i) => {
      c.addEventListener('pointerenter', () => { hovering = true; open(i); cycle(); });
      c.addEventListener('focusin', () => { hovering = true; open(i); cycle(); });
    });
    xp.addEventListener('pointerleave', () => { hovering = false; cycle(); });
    xp.addEventListener('focusout', e => { if (!xp.contains(e.relatedTarget)) { hovering = false; cycle(); } });
    if ('IntersectionObserver' in window) new IntersectionObserver(en => en.forEach(e => { visible = e.isIntersecting; cycle(); }), { threshold: 0.3 }).observe(xp);
    else { visible = true; cycle(); }
    xp.addEventListener('click', e => {
      const a = e.target.closest('.xp__card'); if (!a) return;
      // on touch, the first tap opens the card; the second goes to the catalogue
      if (window.matchMedia('(hover: none)').matches && !a.classList.contains('is-open')) { e.preventDefault(); open(cards.indexOf(a)); return; }
      e.preventDefault();
      state.filter = a.getAttribute('data-family');
      $$('#filters [data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x.getAttribute('data-filter') === state.filter)));
      renderCatalogue();
      const top = $('#catalogue').getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
  }
  /* ---------- blur reveal: characters sharpen into place -------------------- */
  function splitChars(el) {
    if (!el || el.dataset.split) return; el.dataset.split = '1';
    let n = 0;
    const walk = node => { [...node.childNodes].forEach(ch => {
      if (ch.nodeType === 3) {
        const frag = document.createDocumentFragment();
        // words stay unbreakable; only the characters inside them animate
        ch.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const wd = document.createElement('span'); wd.className = 'wd';
          [...part].forEach(c => { const sp = document.createElement('span'); sp.className = 'ch'; sp.textContent = c; sp.style.setProperty('--c', n++); wd.appendChild(sp); });
          frag.appendChild(wd);
        });
        ch.replaceWith(frag);
      } else if (ch.nodeType === 1) walk(ch);
    }); };
    walk(el);
    el.classList.add('blur-reveal');
  }
  function initBlurReveals() {
    const targets = ['#families-title', '#capabilities-title', '#process-title', '#proof-title', '#contact-title', '#moment-line', '.fit__title'].map(q => $(q)).filter(Boolean);
    targets.forEach(splitChars);
    if (reducedMotion() || !('IntersectionObserver' in window)) { targets.forEach(el => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver(en => en.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.4, rootMargin: '0px 0px -8% 0px' });
    targets.forEach(el => io.observe(el));
  }
  function litify(el, text, arrow) {
    // *like this* marks the words to highlight in mint once they are lit
    let hot = false;
    const words = String(text).split(/\s+/).filter(Boolean).map(w => {
      const starts = w.startsWith('*'), ends = /\*[.,;:!?]?$/.test(w);
      const clean = w.replace(/^\*/, '').replace(/\*([.,;:!?]?)$/, '$1');
      const cls = (hot || starts) ? 'w hl' : 'w';
      if (starts) hot = true;
      if (ends) hot = false;
      return `<span class="${cls}">${esc(clean)}</span>`;
    });
    el.innerHTML = (arrow ? '<span class="lead-arrow" aria-hidden="true">→</span>' : '') + words.join(' ');
  }
  function renderIntro() {
    litify($('#intro-lead'), S.intro.lead, true);
    litify($('#intro-punch'), S.intro.punch, false);
    $('#intro-links').innerHTML = S.intro.links.map(l => l.href === '#present'
      ? `<button type="button" data-present>${esc(l.label)} ${ICON.arrowUp}</button>`
      : `<a href="${esc(l.href)}">${esc(l.label)} ${ICON.arrowUp}</a>`).join('');
    const fit = $('#intro-fit');
    if (fit && S.intro.fit && S.intro.fit.length) fit.innerHTML = `<h3 class="fit__title reveal">${esc(S.intro.fitTitle || '')}</h3><ol class="fit__list">${S.intro.fit.map((x, i) => `<li class="reveal" style="--i:${i + 1}">${esc(x)}</li>`).join('')}</ol>`;
  }
  // scroll-lit words (PXPush-style): words brighten as the paragraph passes through the viewport
  function initLit() {
    const paras = $$('.lit');
    if (reducedMotion()) { paras.forEach(p => $$('.w', p).forEach(w => w.classList.add('is-lit'))); return; }
    let last = 0;
    function update() {
      const vh = window.innerHeight;
      paras.forEach(p => {
        const r = p.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const prog = Math.min(1, Math.max(0, (vh * 0.9 - r.top) / (r.height + vh * 0.25)));
        const words = $$('.w', p); const lit = Math.round(prog * words.length);
        words.forEach((w, i) => w.classList.toggle('is-lit', i < lit));
      });
    }
    // throttled on scroll without requestAnimationFrame (rAF pauses in background tabs)
    window.addEventListener('scroll', () => { const now = Date.now(); if (now - last > 40) { last = now; update(); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------- 5. expertise ------------------------------------------------- */
  function renderExpertise() {
    $('#capabilities-title').textContent = S.expertise.title;
    $('#capabilities-text').textContent = S.expertise.text;
    $('#pillars').innerHTML = S.pillars.map((p, i) => `
      <li class="pillar reveal">
        <span class="pillar__n" style="--r:${i * 60}deg">${pad2(i + 1)}</span>
        <div><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p>
          <div class="tags">${(p.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>
      </li>`).join('');
  }

  /* ---------- 6. catalogue -------------------------------------------- */
  const state = { filter: (S.groups[0] && S.groups[0].id) || 'all' };
  function cardHTML(a, i) {
    const v = a.visual || {};
    const media = v.type === 'image' && v.src
      ? `<img src="${esc(v.src)}" alt="${esc(a.name)} render" loading="lazy" decoding="async">`
      : `<div class="slot--cover"><span class="cover__idx">${esc(groupsById[a.group].short || groupsById[a.group].name)}</span><strong class="cover__name">${esc(a.name)}</strong></div>`;
    const play = a.video ? (isFileVideo(a.video) || youtubeId(a.video) || driveId(a.video)
      ? `<button class="dcard__play" type="button" data-video="${esc(a.video)}" data-title="${esc(a.name)}" aria-label="Play the ${esc(a.name)} video">${ICON.play} Video</button>`
      : `<a class="dcard__play" href="${esc(a.video)}" target="_blank" rel="noopener" aria-label="Watch the ${esc(a.name)} video (opens in a new tab)">${ICON.play} Video ${ICON.arrowUp}</a>`) : '';
    return `<article class="dcard reveal" data-id="${esc(a.id)}" style="--i:${i % 4}">
      <a class="dcard__open" href="#a/${esc(a.id)}" aria-label="${esc(a.name)} — open">
        <div class="frame frame--tight">
          <div class="slot">${media}${a.concept ? '<span class="tag slot__badge">Concept</span>' : ''}</div>
          <span class="frame__name">${esc(a.name)}</span>
          <p class="frame__hook">${esc(a.hook)}</p>
        </div>
      </a>${play}</article>`;
  }
  function renderFilters() {
    const el = $('#filters');
    const chips = [{ id: 'all', label: 'All', n: ACTS.length }].concat(S.groups.map(g => ({ id: g.id, label: g.short, n: byGroup(g.id).length })));
    el.innerHTML = chips.map(c => `<button class="chip" type="button" data-filter="${esc(c.id)}" aria-pressed="${state.filter === c.id}">${esc(c.label)} <span class="chip__n">${c.n}</span></button>`).join('')
      + `<span class="filters__count" id="filters-count"></span>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-filter]'); if (!b) return;
      state.filter = b.getAttribute('data-filter');
      $$('[data-filter]', el).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      renderCatalogue();
      const top = $('#catalogue-grid').getBoundingClientRect().top + window.scrollY - 140;
      if (window.scrollY > top) window.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
  }
  function renderCatalogue() {
    const groups = state.filter === 'all' ? S.groups : S.groups.filter(g => g.id === state.filter);
    const grid = $('#catalogue-grid');
    grid.innerHTML = groups.map(g => {
      const items = byGroup(g.id);
      return `<section class="group" aria-labelledby="g-${esc(g.id)}">
        <div class="chapter">
          <span class="idx">Nº${pad2(groupOrder.indexOf(g.id) + 1)} / ${items.length} ${items.length === 1 ? 'experience' : 'experiences'}</span>
          <h3 id="g-${esc(g.id)}">${esc(g.name)}</h3>
          <p>${esc(g.tagline)}</p>
        </div>
        <div class="dcards">${items.map((a, i) => cardHTML(a, i)).join('')}</div>
      </section>`;
    }).join('');
    const count = groups.reduce((n, g) => n + byGroup(g.id).length, 0);
    const c = $('#filters-count'); if (c) c.textContent = `${count} / ${ACTS.length}`;
    $('#catalogue-count').textContent = ACTS.length;
    observeReveals(grid);
    runRenderHooks(grid);
  }

  /* ---------- 7. detail dialog ---------------------------------------- */
  let dialog, currentDetail = null, lastCard = null;
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'detail'; dialog.id = 'detail'; dialog.setAttribute('aria-labelledby', 'detail-title');
    document.body.appendChild(dialog);
    dialog.addEventListener('close', () => {
      currentDetail = null; document.body.classList.remove('is-locked');
      if (location.hash.startsWith('#a/')) history.replaceState(null, '', location.pathname + location.search);
      if (lastCard && lastCard.isConnected) { const f = $('.dcard__open', lastCard) || lastCard; f.focus({ preventScroll: true }); }
    });
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('keydown', e => {
      if (!currentDetail) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); stepDetail(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepDetail(-1); }
    });
    return dialog;
  }
  function stepDetail(dir) {
    const i = ACTS.indexOf(currentDetail); const next = ACTS[(i + dir + ACTS.length) % ACTS.length];
    openDetail(next.id, true);
  }
  function openDetail(id, replace) {
    const a = actById[id]; if (!a) return;
    const g = groupsById[a.group]; const d = ensureDialog();
    currentDetail = a;
    const i = ACTS.indexOf(a), prev = ACTS[(i - 1 + ACTS.length) % ACTS.length], next = ACTS[(i + 1) % ACTS.length];
    d.innerHTML = `<div class="detail__panel">
      <button class="detail__close" type="button" aria-label="Close">${ICON.close}</button>
      <div class="detail__visual"><div class="frame">${slotHTML(a, true)}<span class="frame__name">${esc(a.name)}</span></div></div>
      <div class="detail__content">
        <span class="idx">${esc(g.name)} · ${pad2(indexInGroup(a))} / ${pad2(byGroup(g.id).length)}${a.concept ? ' · Concept' : ''}</span>
        <h2 class="detail__title" id="detail-title">${esc(a.name)}</h2>
        <p class="detail__hook">${esc(a.hook)}</p>
        <p class="detail__what">${esc(a.what)}</p>
        ${a.problem ? `<div class="detail__block"><h5>The problem</h5><p class="detail__p">${esc(a.problem)}</p></div>` : ''}
        ${a.idea ? `<div class="detail__block"><h5>The idea</h5><p class="detail__p detail__p--head">${esc(a.idea)}</p></div>` : ''}
        ${(() => { const facts = (a.proof || []).filter(x => !/^\[NEED:/.test(x)); return facts.length ? `<div class="detail__block"><h5>Proof</h5><ul class="proof">${facts.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''; })()}
        <div class="detail__block"><h5>Where it works</h5><div class="tags">${(a.where || []).map(w => `<span class="tag">${esc(w)}</span>`).join('')}</div></div>
        <div class="detail__actions">
          ${a.video ? videoButton(a, { cls: 'vbtn--lg' }) : ''}
          <button class="btn btn--mint" type="button" data-ask="${esc(a.id)}">Ask about ${esc(a.name)} ${ICON.arrow}</button>
          <button class="btn btn--ghost" type="button" data-present-from="${esc(a.id)}">${ICON.play} Present from here</button>
        </div>
        <div class="detail__nav">
          <button type="button" data-step="-1" aria-label="Previous: ${esc(prev.name)}"><span>← Previous</span><strong>${esc(prev.name)}</strong></button>
          <button type="button" data-step="1" aria-label="Next: ${esc(next.name)}"><span>Next →</span><strong>${esc(next.name)}</strong></button>
        </div>
      </div></div>`;
    $('.detail__close', d).addEventListener('click', () => d.close());
    $$('[data-step]', d).forEach(b => b.addEventListener('click', () => stepDetail(Number(b.getAttribute('data-step')))));
    $('[data-ask]', d).addEventListener('click', () => { d.close(); prefillContact(a); });
    $('[data-present-from]', d).addEventListener('click', () => { d.close(); Present.enter(a.id); });
    runRenderHooks(d);
    if (!d.open) { d.showModal(); document.body.classList.add('is-locked'); }
    $('.detail__content', d).scrollTop = 0;
    const url = `#a/${a.id}`;
    if (location.hash !== url) { if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url); }
  }

  /* ---------- 8. work + big hits ----------------------------------------- */
  function renderWork() {
    if (!$('#work-list')) return;
    $('#work-list').innerHTML = S.projects.map((p, i) => `
      <li class="work__row reveal">
        <span class="n">Nº${pad3(i + 1)}</span>
        <h3>${esc(p.title)}</h3>
        <div class="client">${esc(p.client)}<small>${esc(p.type)}</small></div>
        <p>${esc(p.summary)}</p>
      </li>`).join('');
    $('#hits-grid').innerHTML = (S.bigHits || []).map(h => {
      const id = 'hit-' + slug(h.name);
      const item = { id, name: h.name, visual: h.visual || { type: 'placeholder' }, video: h.video, videoInternal: h.videoInternal };
      return `<article class="dcard reveal"><div class="frame">
        ${slotHTML(item, false, { label: 'Photo here', file: `assets/hits/${slug(h.name)}.webp`, hint: 'Event photo' })}
        <span class="frame__name">${esc(h.name)}</span>
        <div class="dcard__foot">${videoButton(item)}</div>
      </div></article>`;
    }).join('');
  }

  /* ---------- 9. process ---------------------------------------------- */
  function renderProcess() {
    $('#steps').innerHTML = S.process.map((st, i) => `<li class="rail__step" data-step="${i}"><span class="rail__dot" aria-hidden="true"></span><span class="rail__n">${esc(st.step)}</span><div class="rail__body"><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p></div></li>`).join('');
    $('#facts').innerHTML = S.workFacts.map((f, i) => `<li class="fact reveal" style="--i:${i}"><strong>${esc(f.k)}</strong><span>${esc(f.v)}</span></li>`).join('');
  }
  // the rail fills as you read down the steps; the current step lights up
  function initRail() {
    const rail = $('#steps'), steps = $$('.rail__step', rail || document); if (!rail || !steps.length) return;
    const now = $('#process-now');
    let raf = 0;
    function update() {
      raf = 0;
      const line = window.innerHeight * 0.62, r = rail.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (line - r.top) / r.height));
      rail.style.setProperty('--p', p.toFixed(4));
      let active = 0;
      steps.forEach((st, i) => { const sr = st.getBoundingClientRect(); const on = sr.top < line; st.classList.toggle('is-on', on); if (on) active = i; });
      if (now) now.textContent = pad2(active + 1);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', kick, { passive: true }); window.addEventListener('resize', kick); kick();
  }
  // the moment: one full-bleed render
  function renderMoment() {
    const m = S.hero.moment, el = $('#moment-media'); if (!m || !el) return;
    el.innerHTML = `<img src="${esc(m.src)}" alt="" loading="lazy" decoding="async">`;
    $('#moment-line').textContent = m.line || '';
    const sec = $('#moment');
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver(en => en.forEach(e => { if (e.isIntersecting) { sec.classList.add('is-in'); io.disconnect(); } }), { threshold: 0.25 }); io.observe(sec); } else sec.classList.add('is-in');
    // cinematic: the render zooms slowly as the section passes through the viewport
    if (reducedMotion()) return;
    const img = $('img', el); let raf = 0;
    const update = () => {
      raf = 0;
      const r = sec.getBoundingClientRect(), vh = window.innerHeight;
      if (r.bottom < 0 || r.top > vh) return;
      const p = Math.max(0, Math.min(1, (vh - r.top) / (vh + r.height)));
      img.style.transform = `scale(${(1 + 0.16 * p).toFixed(4)})`;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', kick, { passive: true }); window.addEventListener('resize', kick); kick();
  }
  /* ---------- 10. proof ------------------------------------------------- */
  // a wall item: the logo when we have it, the name set quietly when we don't
  function wallItemHTML(item, i, opts) {
    opts = opts || {};
    const mark = item.logo
      ? `<img src="${esc(item.logo)}" alt="${esc(item.name)}" loading="lazy" decoding="async">`
      : `<span class="wall__name">${esc(item.name)}</span>`;
    if (item.note && !/^\[NEED:/.test(item.note) && !opts.still) {
      return `<button class="wall__item wall__item--note" type="button" aria-pressed="false" aria-label="${esc(item.name)}: ${esc(item.note)}" data-name="${esc(item.name)}" data-note="${esc(item.note)}" style="--i:${i}">${mark}</button>`;
    }
    return `<span class="wall__item" style="--i:${i}" ${item.logo ? '' : `title="${esc(item.name)}"`}>${mark}</span>`;
  }
  function renderProof() {
    const cl = S.clientele || {};
    if ($('#proof-title')) $('#proof-title').textContent = cl.title || 'In good company.';
    if ($('#proof-text')) $('#proof-text').textContent = cl.text || '';
    if ($('#agencies-label')) $('#agencies-label').textContent = cl.agenciesLabel || 'Agencies';
    if ($('#brands-label')) $('#brands-label').textContent = cl.brandsLabel || 'Brands';
    if ($('#industries-label')) $('#industries-label').textContent = cl.industriesLabel || 'Industries';
    initRiver($('#partners'), S.partners);
    initFlip($('#brands'), S.brands);
    $('#industries').innerHTML = S.industries.map(x => `<span>${esc(x)}</span>`).join('<span class="industries__dot" aria-hidden="true"></span>');
    $('#offices').innerHTML = S.offices.map(o => `
      <li class="office reveal">
        <h3>${esc(o.city)}</h3>
        <p class="small">${esc(o.address)}</p>
        <div class="office__links">
          <a href="${esc(o.phoneHref)}">${esc(o.phone)}</a>
          <a href="mailto:${esc(o.email)}">${esc(o.email)}</a>
        </div>
      </li>`).join('');
  }
  // a live roster: `slots` names on screen, the rest wait their turn. Every few seconds one slot
  // flaps over and a name that was NOT on screen takes its place, so the motion always shows
  // something new. Hover pauses it; the Pause button stops it; off-screen it sleeps.
  // the agency logos drift slowly across the screen; hover or Pause holds them
  function initRiver(river, items) {
    if (!river) return;
    const track = $('.river__track', river);
    const useLogos = !(S.clientele && S.clientele.riverLogos === false);
    const cell = it => `<span class="river__item" title="${esc(it.name)}">${useLogos && it.logo ? `<img src="${esc(it.logo)}" alt="${esc(it.name)}" loading="eager" decoding="async">` : `<span class="river__name">${esc(it.name)}</span>`}</span>`;
    const row = items.map(cell).join('');
    track.innerHTML = row + row;                       // doubled for a seamless loop
    track.style.setProperty('--dur', `${(S.clientele && S.clientele.riverSeconds) || 75}s`);
    const pauseBtn = $('[data-pause="partners"]');
    if (reducedMotion()) { river.classList.add('is-still'); return; }
    if ('IntersectionObserver' in window) new IntersectionObserver(en => en.forEach(e => river.classList.toggle('is-live', e.isIntersecting)), { threshold: 0.1 }).observe(river);
    else river.classList.add('is-live');
    if (pauseBtn) { pauseBtn.hidden = false; pauseBtn.addEventListener('click', () => { const on = river.classList.toggle('is-paused'); pauseBtn.setAttribute('aria-pressed', String(on)); pauseBtn.textContent = on ? 'Play' : 'Pause'; }); }
  }
  // one big word: the brand flaps over to the next name, and the line below says what we built
  function initFlip(root, items) {
    if (!root || !items.length) return;
    const lead = $('#flip-lead'), word = $('#flip-word'), note = $('#flip-note');
    lead.textContent = (S.clientele && S.clientele.flipLead) || 'Built for';
    const face = (b, cls) => `<span class="flip__face ${cls}">${esc(b.name)}</span>`;
    let i = 0, timer = 0, hovering = false, visible = false, paused = false, busy = false;
    const setNote = b => { note.textContent = b.note && !/^\[NEED:/.test(b.note) ? b.note : ''; };
    word.innerHTML = face(items[0], 'is-on'); setNote(items[0]);
    function flap() {
      if (busy || paused || hovering || !visible || document.hidden) return;
      busy = true;
      const cur = $('.flip__face.is-on', word), nxt = items[(i + 1) % items.length];
      i = (i + 1) % items.length;
      word.insertAdjacentHTML('beforeend', face(nxt, 'is-next'));
      const el = $('.flip__face.is-next', word);
      note.classList.add('is-out');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        cur.classList.add('is-out'); cur.classList.remove('is-on');
        el.classList.remove('is-next'); el.classList.add('is-on');
        window.setTimeout(() => { cur.remove(); setNote(nxt); note.classList.remove('is-out'); busy = false; }, 420);
      }));
    }
    const start = () => { if (!timer) timer = window.setInterval(flap, (S.clientele && S.clientele.flipMs) || 2200); };
    if (reducedMotion()) return;
    root.addEventListener('pointerenter', () => { hovering = true; });
    root.addEventListener('pointerleave', () => { hovering = false; });
    if ('IntersectionObserver' in window) new IntersectionObserver(en => en.forEach(e => { visible = e.isIntersecting; }), { threshold: 0.4 }).observe(root);
    else visible = true;
    const pauseBtn = $('[data-pause="brands"]');
    if (pauseBtn) { pauseBtn.hidden = false; pauseBtn.addEventListener('click', () => { paused = !paused; pauseBtn.setAttribute('aria-pressed', String(paused)); pauseBtn.textContent = paused ? 'Play' : 'Pause'; }); }
    window.setTimeout(start, 1400);
  }

  /* ---------- 11. contact + QR ---------------------------------------- */
  // The QR points at the deck PDF next to the page (or wherever brand.qrUrl says).
  // Opened from disk or in a preview, it uses brand.liveUrl so the code is right before the site is up.
  const isSandboxed = () => !/^https?:$/.test(location.protocol) || /claudeusercontent\.com$|^localhost$|^127\./.test(location.hostname);
  function siteBase() { return isSandboxed() ? (S.brand.liveUrl || S.brand.url + '/') : location.origin + location.pathname.replace(/[^/]*$/, ''); }
  // On the live site the QR downloads the deck PDF. Shared from claude.ai (or opened from disk)
  // it opens the shared page instead, where the PDF button works.
  function qrUrl() {
    if (S.brand.qrUrl) return S.brand.qrUrl;
    if (isSandboxed()) return S.brand.shareUrl || siteBase();
    if (S.brand.pdf) { try { return new URL(S.brand.pdf, siteBase()).href; } catch (e) { /* fall through */ } }
    return siteBase();
  }
  const qrCaption = () => (isSandboxed() && S.brand.shareUrl ? (S.contact.qrCaptionPage || S.contact.qrCaption) : S.contact.qrCaption);
  // the PDF button: a plain download on the web; inside the claude.ai viewer, its download capability
  async function savePdf(e) {
    if (!(window.claude && typeof window.claude.use === 'function')) return;   // normal link elsewhere
    e.preventDefault();
    const btn = e.currentTarget, old = btn.textContent; btn.textContent = 'Preparing…';
    try {
      const dl = await window.claude.use('downloads'); if (!dl) throw new Error('no downloads');
      const blob = await (await fetch(S.brand.pdf)).blob();
      await dl.save({ filename: '4brains-deck.pdf', data: blob });
      btn.textContent = 'Saved';
    } catch (err) {
      if (err && /no downloads/.test(String(err.message))) { btn.textContent = 'Open the PDF ↗'; btn.target = '_blank'; btn.removeAttribute('download'); btn.removeEventListener('click', savePdf); }
      else btn.textContent = old;                       // declined or failed: try again any time
    }
    setTimeout(() => { if (btn.textContent === 'Saved') btn.textContent = old; }, 2500);
  }
  function qrSVG() {
    try { return QR.toSVG(qrUrl(), { ecc: 'M', margin: 2, fg: '#0A0B0D', bg: '#E9FBF4', label: 'QR code: open this catalogue on your phone' }); }
    catch (e) { console.warn(e); return ''; }
  }
  function renderContact() {
    $('#contact-title').innerHTML = S.contact.title;
    $('#contact-text').textContent = S.contact.text;
    $('#direct').innerHTML = `<a href="mailto:${esc(S.brand.email)}">${ICON.mail}${esc(S.brand.email)}</a><a href="${esc(S.brand.phoneHref)}">${ICON.phone}${esc(S.brand.phone)}</a>`;
    $('#qr').innerHTML = `${qrSVG()}<div><strong>${esc(qrCaption())}</strong>${S.brand.pdf ? `<a class="qr-card__link" href="${esc(S.brand.pdf)}" download="4brains-deck.pdf">Download the deck (PDF) ${ICON.arrowUp}</a>` : `<span>${esc(qrUrl())}</span>`}</div>`;
    const pdfLink = $('.qr-card__link', $('#qr')); if (pdfLink) pdfLink.addEventListener('click', savePdf);
    if ($('#f-type') && $('#f-type').tagName === 'SELECT') $('#f-type').innerHTML = `<option value="">Select one</option>` + S.contact.projectTypes.map(t => `<option>${esc(t)}</option>`).join('');
    $('#brief').addEventListener('submit', onSubmitBrief);
    $('#brief-copy').addEventListener('click', () => copyText($('#brief-text').textContent));
  }
  function prefillContact(a) {
    const f = $('#f-activity'); if (f) f.value = a.name;
    const sel = $('#f-type');
    const guess = { signature: 'Kinetic / LED installation', environments: 'Interactive installation', ai: 'Interactive installation', games: 'Brand activation', portraits: 'Brand activation', checkin: 'Event technology & registration' }[a.group];
    if (sel && guess) sel.value = guess;
    $('#contact').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => { const n = $('#f-name'); if (n) n.focus({ preventScroll: true }); }, 500);
  }
  function onSubmitBrief(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const line = (k, v) => (v ? `${k}: ${v}` : null);
    const body = [
      'Brief for 4Brains',
      line('Name', data.name), line('Company', data.company), line('Email', data.email), line('Phone', data.phone),
      line('Project type', data.type), line('Interested in', data.activity), line('When / where', data.when),
      '', `${data.details || ''}`,
    ].filter(x => x !== null).join('\n');
    const done = $('#brief-done'); $('#brief-text').textContent = body; done.classList.add('is-visible');
    const btn = $('#brief-submit'); btn.disabled = true;
    if (S.brand.formEndpoint) {
      fetch(S.brand.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(r.status); $('#brief-status').textContent = 'Sent. We’ll reply from ' + S.brand.email + '.'; })
        .catch(() => { $('#brief-status').textContent = 'Could not send automatically — email the text below to ' + S.brand.email + '.'; })
        .finally(() => { btn.disabled = false; });
    } else {
      btn.disabled = false;
      const subject = encodeURIComponent(`Brief: ${data.activity || data.type || 'event experience'} — ${data.company || data.name || ''}`);
      const mailto = `mailto:${S.brand.email}?subject=${subject}&body=${encodeURIComponent(body)}`;
      const framed = window.top !== window.self;   // inside a viewer (claude.ai), navigating to mailto: would blank the page
      if (framed) {
        $('#brief-status').innerHTML = `Copy the brief below and email it to <a href="mailto:${esc(S.brand.email)}" target="_blank" rel="noopener">${esc(S.brand.email)}</a>, or <a href="${esc(mailto)}" target="_blank" rel="noopener">open it in your email app</a>.`;
      } else {
        $('#brief-status').textContent = 'We’ve opened your email app with this brief. If nothing opened, copy it and send to ' + S.brand.email + '.';
        try { window.location.href = mailto; } catch (err) { /* ignore */ }
      }
    }
    done.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }

  /* ---------- 12. footer ---------------------------------------------- */
  function renderFooter() {
    $('#footer-social').innerHTML = S.brand.socials.map(s => `<li><a href="${esc(s.href)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a></li>`).join('');
    $('#footer-offices').innerHTML = S.offices.map(o => `<li><a href="${esc(o.maps)}" target="_blank" rel="noopener">${esc(o.city)}</a> <span class="small">· ${esc(o.phone)}</span></li>`).join('');
    $('#footer-year').textContent = new Date().getFullYear();
    $('#footer-contact').innerHTML = `<a href="mailto:${esc(S.brand.email)}">${esc(S.brand.email)}</a><br><a href="${esc(S.brand.phoneHref)}">${esc(S.brand.phone)}</a>`;
  }

  /* ---------- 13. present mode -----------------------------------------
     Full-screen, big type, swipe / arrows / keys, auto-advance when idle.
     URL: #present (or #present/<activity-id> to start on an activity).     */
  const Present = (function () {
    const cfg = Object.assign({ idleMs: 15000, autoAdvanceMs: 9000, chapters: true, showQR: true }, S.present || {});
    let root, stageEl, slides = [], index = 0, active = false, lastInput = 0, autoStart = 0, timer = 0, wakeLock = null, returnFocus = null, built = false;

    function buildSlides() {
      slides = [{ type: 'cover', hud: S.brand.name }, { type: 'numbers', hud: 'In numbers' }];
      S.groups.forEach(g => {
        const items = byGroup(g.id);
        if (cfg.chapters) slides.push({ type: 'chapter', group: g, count: items.length });
        items.forEach(a => slides.push({ type: 'activity', a, group: g }));
      });
      slides.push({ type: 'process', hud: 'How we work' }, { type: 'clients', hud: 'Our clientele' }, { type: 'end', hud: 'Contact' });
    }
    const firstSentence = t => { const m = String(t || '').match(/^(.*?[.!?])(\s|$)/); return m ? m[1] : t; };
    function slideHTML(s, i) {
      const wrap = (cls, inner) => `<section class="slide ${cls}" data-i="${i}" aria-hidden="true">${inner}</section>`;
      if (s.type === 'cover') {
        return wrap('slide--cover', `<div class="slide__text">
            ${S.hero.eyebrow ? `<span class="idx">${esc(S.hero.eyebrow)}</span>` : ''}
            <h2 class="present__title present__title--cover">${S.hero.title}</h2>
            <p class="slide__why slide__why--cover">${esc(S.hero.subline)}</p></div>
          <div class="slide__visual slide__visual--cover"><div class="frame">${slotHTML({ id: 'cover', name: 'Cover', visual: S.hero.visual || {} }, true).replace('loading="lazy"', 'loading="eager"')}</div></div>`);
      }
      if (s.type === 'numbers') {
        return wrap('slide--numbers', `<div class="slide__inner">
            <span class="idx">In numbers</span>
            <div class="numbers__grid numbers__grid--slide">${S.stats.map(statHTML).join('')}</div>
            <p class="slide__hook slide__hook--quiet">${esc(S.intro.punch || '')}</p></div>`);
      }
      if (s.type === 'chapter') {
        const gi = groupOrder.indexOf(s.group.id), c = groupCover(s.group), v = (c && c.visual) || {};
        return wrap('slide--chapter', `${v.type === 'image' && v.src ? `<div class="slide__bg"><img src="${esc(v.src)}" alt="" loading="eager" decoding="async"></div>` : ''}
          <div class="slide__inner">
            <span class="idx">Chapter ${pad2(gi + 1)} / ${pad2(S.groups.length)}</span>
            <h2 class="present__title">${esc(s.group.name)}</h2>
            <p class="slide__hook">${esc(s.group.tagline)}</p>
            <p class="slide__count idx">${s.count} ${s.count === 1 ? 'experience' : 'experiences'} →</p></div>`);
      }
      if (s.type === 'process') {
        return wrap('slide--process slide--light', `<div class="slide__inner">
            <span class="idx idx--ink">How we work</span>
            <h2 class="present__title present__title--sm">Brief to show day, without the hand-offs.</h2>
            <ol class="pslide">${S.process.map(st => `<li><span class="pslide__n">${esc(st.step)}</span><h3>${esc(st.title)}</h3><p>${esc(firstSentence(st.text))}</p></li>`).join('')}</ol></div>`);
      }
      if (s.type === 'clients') {
        const cl = S.clientele || {};
        return wrap('slide--clients', `<div class="slide__inner">
            <span class="idx">Our clientele</span>
            <h2 class="present__title present__title--sm">${esc(cl.title || 'In good company.')}</h2>
            <span class="idx cslide__label">${esc(cl.agenciesLabel || 'Agencies that bring us in')}</span>
            <div class="wall wall--slide is-in is-settled">${S.partners.map((p, i) => wallItemHTML(p, i, { still: true })).join('')}</div>
            <span class="idx cslide__label">${esc(cl.brandsLabel || 'Brands we have built for')}</span>
            <div class="wall wall--slide is-in is-settled">${S.brands.map((b, i) => wallItemHTML(b, i, { still: true })).join('')}</div></div>`);
      }
      if (s.type === 'end') {
        return wrap('slide--end', `<div class="slide__text">
            <span class="idx">Start a brief</span>
            <h2 class="present__title present__title--end">${S.contact.title}</h2>
            <p class="slide__why">${esc(S.contact.text)}</p>
            <div class="direct"><a href="mailto:${esc(S.brand.email)}">${ICON.mail}${esc(S.brand.email)}</a><a href="${esc(S.brand.phoneHref)}">${ICON.phone}${esc(S.brand.phone)}</a></div></div>
          <div class="slide__aside"><div class="qr-card qr-card--big">${qrSVG()}<div><strong>${esc(qrCaption())}</strong><span>${esc(qrUrl().replace(/^https?:\/\//, ''))}</span></div></div></div>`);
      }
      const a = s.a;
      const proofs = (a.proof || []).filter(x => !/^\[NEED:/.test(x)).slice(0, 3);
      const videos = (a.video ? videoButton(a, { cls: 'vbtn--ghost' }) : '') + (a.videoInternal ? `<a class="vbtn vbtn--ghost" href="${esc(a.videoInternal)}" target="_blank" rel="noopener" title="Opens on SharePoint / Drive — team login required">Internal video ${ICON.arrowUp}</a>` : '');
      return wrap('slide--activity', `<div class="slide__visual" data-visual="${esc(a.id)}"></div>
        <div class="slide__text">
          <span class="idx">${esc(s.group.name)} · ${pad2(indexInGroup(a))} / ${pad2(byGroup(a.group).length)}${a.concept ? ' · Concept' : ''}</span>
          <h2 class="present__title">${esc(a.name)}</h2>
          <p class="slide__hook">${esc(a.hook)}</p>
          <p class="slide__why">${esc(a.what)}</p>
          ${proofs.length ? `<ol class="slide__gets">${proofs.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
          ${(a.where || []).length ? `<p class="slide__where">${(a.where || []).map(esc).join(' · ')}</p>` : ''}
          ${videos ? `<div class="slide__actions">${videos}</div>` : ''}
        </div>`);
    }
    function build() {
      root = $('#present'); stageEl = $('.present__stage', root);
      buildSlides();
      stageEl.innerHTML = `<button class="present__tap present__tap--prev" type="button" aria-label="Previous slide"></button><button class="present__tap present__tap--next" type="button" aria-label="Next slide"></button>` + slides.map(slideHTML).join('');
      $('.present__progress', root).innerHTML = slides.map(() => '<i></i>').join('');
      $('.present__qr', root).innerHTML = cfg.showQR ? `${qrSVG()}<span>${esc(qrCaption())}</span>` : '';
      $('.present__tap--prev', root).addEventListener('click', () => { touch(); go(index - 1); });
      $('.present__tap--next', root).addEventListener('click', () => { touch(); go(index + 1); });
      $('[data-prev]', root).addEventListener('click', () => { touch(); go(index - 1); });
      $('[data-next]', root).addEventListener('click', () => { touch(); go(index + 1); });
      $('[data-exit]', root).addEventListener('click', exit);
      let sx = 0, sy = 0, st = 0;
      stageEl.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; st = Date.now(); }, { passive: true });
      stageEl.addEventListener('pointerup', e => {
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - st < 800) { touch(); go(index + (dx < 0 ? 1 : -1)); }
      }, { passive: true });
      ['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach(ev => root.addEventListener(ev, touch, { passive: true }));
      document.addEventListener('visibilitychange', () => { if (document.hidden) touch(); else requestWakeLock(); });
      document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && active && root.dataset.fs === '1') exit(); });
      built = true;
    }
    function mountVisual(s, el) {
      if (el.dataset.mounted) return;
      el.innerHTML = `<div class="frame">${slotHTML(s.a, true)}<span class="frame__name">${esc(s.a.name)}</span></div>`;
      el.dataset.mounted = '1';
      runRenderHooks(el);
    }
    function go(i, opts) {
      opts = opts || {};
      const n = slides.length;
      i = ((i % n) + n) % n;
      $$('.slide', stageEl).forEach((el, k) => {
        const isActive = k === i;
        el.classList.toggle('is-active', isActive);
        const t = $('.present__title', el); if (t) { splitChars(t); t.classList.toggle('is-in', isActive); }
        el.classList.toggle('is-prev', k < i);
        el.setAttribute('aria-hidden', String(!isActive));
        const slot = $('.slot', el); if (slot) slot.classList.toggle('slot--live', isActive);
        const v = $('video', el); if (v) { if (isActive) v.play().catch(() => {}); else v.pause(); }
      });
      index = i;
      const s = slides[i];
      [i, i + 1, i - 1].forEach(k => { const kk = ((k % n) + n) % n; const sl = slides[kk]; if (sl.type === 'activity') { const el = $(`.slide[data-i="${kk}"] .slide__visual`, stageEl); if (el) mountVisual(sl, el); } });
      $$('.present__progress i', root).forEach((p, k) => { p.classList.toggle('is-done', k < i); p.classList.toggle('is-current', k === i); p.style.setProperty('--p', k < i ? 1 : 0); });
      $('.present__counter', root).textContent = `${pad2(i + 1)} / ${pad2(n)}`;
      $('.present__chapter-name', root).textContent = s.group ? s.group.name : (s.hud || '');
      $('.present__live', root).textContent = s.type === 'activity' ? `${s.a.name}. ${s.a.hook}` : s.type === 'chapter' ? `Chapter: ${s.group.name}` : (s.hud || '');
      if (s.type === 'numbers') $$(`.slide[data-i="${i}"] [data-count]`, stageEl).forEach(countUp);
      if (!opts.silent) history.replaceState(null, '', s.type === 'activity' ? `#present/${s.a.id}` : '#present');
      autoStart = 0;
    }
    function touch() { lastInput = Date.now(); if (root && root.classList.contains('is-auto')) { root.classList.remove('is-auto'); autoStart = 0; const cur = $('.present__progress i.is-current', root); if (cur) cur.style.setProperty('--p', 0); } }
    function tick() {
      if (!active) return;
      const now = Date.now();
      const modalOpen = (vmodal && vmodal.open);
      if (!document.hidden && !modalOpen && now - lastInput > cfg.idleMs) {
        if (!autoStart) { autoStart = now; root.classList.add('is-auto'); }
        const p = Math.min(1, (now - autoStart) / cfg.autoAdvanceMs);
        const cur = $('.present__progress i.is-current', root); if (cur) cur.style.setProperty('--p', p.toFixed(3));
        if (p >= 1) { go(index + 1); autoStart = Date.now(); }
      }
      timer = window.setTimeout(tick, 120);
    }
    async function requestWakeLock() {
      if (!active || !('wakeLock' in navigator)) return;
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* not available — fine */ }
    }
    function onKey(e) {
      if (!active) return;
      if (vmodal && vmodal.open) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': case 'Enter': e.preventDefault(); go(index + 1); break;
        case 'ArrowLeft': case 'ArrowUp': case 'PageUp': e.preventDefault(); go(index - 1); break;
        case 'Home': e.preventDefault(); go(0); break;
        case 'End': e.preventDefault(); go(slides.length - 1); break;
        case 'Escape': e.preventDefault(); exit(); break;
        case 'f': case 'F': toggleFullscreen(); break;
        default:
          if (/^[1-9]$/.test(e.key)) { const gi = Number(e.key) - 1; const k = slides.findIndex(s => s.type === 'chapter' && s.group === S.groups[gi]); if (k >= 0) go(k); }
      }
    }
    function toggleFullscreen() {
      const de = document.documentElement;
      if (!document.fullscreenElement && de.requestFullscreen) { de.requestFullscreen().then(() => { root.dataset.fs = '1'; }).catch(() => {}); }
      else if (document.exitFullscreen) { root.dataset.fs = ''; document.exitFullscreen().catch(() => {}); }
    }
    function enter(startId, opts) {
      opts = opts || {};
      if (!built) build();
      if (dialog && dialog.open) dialog.close();
      returnFocus = document.activeElement;
      active = true; root.hidden = false; document.body.classList.add('is-locked');
      let start = 0;
      if (startId) { const k = slides.findIndex(s => s.type === 'activity' && s.a.id === startId); if (k >= 0) start = k; }
      go(start);
      lastInput = Date.now();
      document.addEventListener('keydown', onKey);
      if (!opts.noFullscreen && document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => { root.dataset.fs = '1'; }).catch(() => {});
      }
      requestWakeLock();
      $('[data-exit]', root).focus({ preventScroll: true });
      clearTimeout(timer); tick();
    }
    function exit() {
      if (!active) return;
      active = false; root.hidden = true; root.classList.remove('is-auto'); document.body.classList.remove('is-locked');
      document.removeEventListener('keydown', onKey);
      clearTimeout(timer);
      if (wakeLock) { try { wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; }
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      root.dataset.fs = '';
      $$('video', root).forEach(v => v.pause());
      if (location.hash.startsWith('#present')) history.replaceState(null, '', location.pathname + location.search);
      if (returnFocus && returnFocus.focus) returnFocus.focus({ preventScroll: true });
    }
    return { enter, exit, isActive: () => active };
  })();

  /* ---------- 14. motion, nav, routing, service worker --------------- */
  let io;
  function observeReveals(root) {
    const els = $$('.reveal:not(.is-in)', root || document);
    if (!('IntersectionObserver' in window) || reducedMotion()) { els.forEach(el => el.classList.add('is-in')); return; }
    if (!io) io = new IntersectionObserver(entries => { entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }); }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' });
    els.forEach(el => io.observe(el));
    revealVisible();
  }
  // Safety net: also reveal on scroll (IntersectionObserver callbacks can lag in throttled tabs
  // and after restored scroll positions). Cheap: one getBoundingClientRect per pending element.
  let revealLast = 0;
  function revealVisible() {
    const vh = window.innerHeight;
    $$('.reveal:not(.is-in)').forEach(el => { const r = el.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) el.classList.add('is-in'); });
  }
  window.addEventListener('scroll', () => { const now = Date.now(); if (now - revealLast > 80) { revealLast = now; revealVisible(); } }, { passive: true });
  window.addEventListener('load', revealVisible);
  function initNav() {
    const btn = $('#nav-menu'), sheet = $('#nav-sheet');
    btn.innerHTML = '<span class="hb" aria-hidden="true"><i></i><i></i><i></i></span>';
    // the logo goes to the top (the header is fixed, so the anchor alone would not scroll)
    const brand = $('.brand'); if (brand) brand.addEventListener('click', e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); sheet.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); });
    $$('a', sheet).forEach((a, i) => a.style.setProperty('--i', i));
    btn.addEventListener('click', () => { const open = sheet.classList.toggle('is-open'); btn.setAttribute('aria-expanded', String(open)); });
    $$('a', sheet).forEach(a => a.addEventListener('click', () => { sheet.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }));
    document.addEventListener('click', e => {
      const p = e.target.closest('[data-present]'); if (p) { e.preventDefault(); Present.enter(); return; }
      const open = e.target.closest('.dcard__open, .dcard__more');
      if (!open || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault(); lastCard = open.closest('.dcard'); openDetail(lastCard.getAttribute('data-id'));
    });
  }
  function initSpy() {
    const links = $$('.nav__links a[href^="#"]'); if (!links.length) return;
    const targets = links.map(a => ({ a, el: document.querySelector(a.getAttribute('href')) })).filter(t => t.el);
    function update() {
      const line = window.scrollY + window.innerHeight * 0.38;
      let cur = null;
      targets.forEach(t => { if (t.el.offsetTop <= line) cur = t; });
      if (window.scrollY < 80) cur = null;
      targets.forEach(t => { if (t === cur) t.a.setAttribute('aria-current', 'true'); else t.a.removeAttribute('aria-current'); });
    }
    let raf = 0; const kick = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick); update();
  }
  function route() {
    const h = location.hash;
    if (h.startsWith('#present')) { const id = h.split('/')[1]; Present.enter(id || null, { noFullscreen: true }); return; }
    if (h.startsWith('#a/')) { const id = h.slice(3); if (actById[id]) openDetail(id, true); return; }
    if (dialog && dialog.open) dialog.close();
  }
  function initSW() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache unavailable — fine */ }); });
  }

  /* ---------- 15. boot ---------------------------------------------- */
  function boot() {
    renderStrips(); renderHero(); renderFamilies(); renderIntro(); renderExpertise(); renderFilters(); renderCatalogue(); renderWork(); renderMoment(); renderProcess(); renderProof(); renderContact(); renderFooter();
    initNav(); initSpy(); observeReveals(document); initLit(); initCounters(); initRail(); initBlurReveals();
    window.addEventListener('hashchange', route);
    window.addEventListener('popstate', route);
    route();
    initSW();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
