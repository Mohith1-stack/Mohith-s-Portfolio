/* ==========================================================================
   Mohith Dande — interface layer
   Classic script (no modules) so the page stays fully usable even if WebGL
   or ES modules are unavailable. Shares scroll state with world.js through
   window.PortfolioState.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document.documentElement;
  var mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');

  var state = window.PortfolioState = window.PortfolioState || {};
  state.c = 0;               // continuous chapter progress 0..5
  state.chapter = 0;         // active chapter index
  state.journey = 0;         // active milestone index
  state.stack = [0, 0, 0, 0, 0, 0];
  state.pointerX = 0;
  state.pointerY = 0;
  state.reduced = mqReduced.matches;

  var LAYER_KEYS = ['languages', 'frameworks', 'data', 'ai', 'security', 'applications'];

  var sections = Array.prototype.slice.call(document.querySelectorAll('[data-chapter]'));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('[data-nav]'));
  var railLinks = Array.prototype.slice.call(document.querySelectorAll('[data-rail]'));
  var railFill = document.querySelector('.rail__progress-fill');
  var frames = Array.prototype.slice.call(document.querySelectorAll('.build__frame'));
  var milestones = Array.prototype.slice.call(document.querySelectorAll('[data-milestone]'));
  var timeline = document.querySelector('.timeline');
  var journeyCurrent = document.querySelector('.journey__current');
  var groups = Array.prototype.slice.call(document.querySelectorAll('.group[data-layers]'));
  var svgLayers = Array.prototype.slice.call(document.querySelectorAll('.layer[data-layer]'));
  var stackSection = document.getElementById('stack');
  var archChain = document.querySelector('.arch__chain');

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smoothstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function pad(n) { return (n < 9 ? '0' : '') + (n + 1); }

  /* ------------------------------------------------------------------
     Word splitting for headings
     ------------------------------------------------------------------ */
  function splitWords(el) {
    if (el.getAttribute('data-split-done')) return;
    el.setAttribute('data-split-done', '1');
    var label = el.textContent.replace(/\s+/g, ' ').trim();
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var text = child.textContent;
          if (!text.trim()) return;
          var frag = document.createDocumentFragment();
          text.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (!part.trim()) { frag.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span');
            w.className = 'w';
            w.setAttribute('aria-hidden', 'true');
            var inner = document.createElement('span');
            inner.className = 'w__i';
            inner.style.setProperty('--i', i++);
            inner.textContent = part;
            w.appendChild(inner);
            frag.appendChild(w);
          });
          child.parentNode.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          walk(child);
        }
      });
    })(el);
    // keep one clean accessible name for the heading
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = label;
    el.appendChild(sr);
  }

  document.querySelectorAll('[data-split]').forEach(splitWords);

  /* ------------------------------------------------------------------
     Reveals
     ------------------------------------------------------------------ */
  var revealObserver = null;
  function setupReveals() {
    if (state.reduced || !('IntersectionObserver' in window)) {
      doc.classList.remove('reveal-ready');
      return;
    }
    doc.classList.add('reveal-ready');
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    document.querySelectorAll('[data-split], [data-reveal]').forEach(function (el) {
      // anything already scrolled past (e.g. deep link) is shown immediately
      var r = el.getBoundingClientRect();
      if (r.bottom < 0) { el.classList.add('is-in'); return; }
      revealObserver.observe(el);
    });
  }

  /* ------------------------------------------------------------------
     Scroll story: anchors, continuous progress, active chapter
     ------------------------------------------------------------------ */
  var anchors = [];
  var tops = [];
  var vh = window.innerHeight;
  var maxScroll = 1;

  function measure() {
    vh = window.innerHeight;
    maxScroll = Math.max(1, doc.scrollHeight - vh);
    var y = window.scrollY || window.pageYOffset;
    tops = sections.map(function (s) { return s.getBoundingClientRect().top + y; });
    anchors = tops.map(function (top, i) {
      if (i === 0) return 0;
      return clamp(top - vh * 0.25, 0, maxScroll);
    });
    for (var i = 1; i < anchors.length; i++) {
      if (anchors[i] <= anchors[i - 1]) anchors[i] = anchors[i - 1] + 1;
    }
    if (archChain) archChain.style.setProperty('--chain-h', archChain.offsetHeight + 'px');
  }

  function progressAt(y) {
    if (y <= anchors[0]) return 0;
    for (var i = 0; i < anchors.length - 1; i++) {
      if (y < anchors[i + 1]) return i + (y - anchors[i]) / (anchors[i + 1] - anchors[i]);
    }
    return anchors.length - 1;
  }

  // world.js samples this every frame so the 3D scene tracks the page exactly
  state.progressAt = function () { return state.c; };

  function setActiveChapter(index) {
    state.chapter = index;
    navLinks.forEach(function (a) {
      if (+a.getAttribute('data-nav') === index) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    railLinks.forEach(function (a) {
      if (+a.getAttribute('data-rail') === index) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    document.body.setAttribute('data-active-chapter', String(index));
    window.dispatchEvent(new CustomEvent('portfolio:chapter', { detail: { chapter: index } }));
  }

  var updateCount = 0;
  var ticking = false;
  var isDesktop = window.matchMedia('(min-width: 768px)');
  var hoverGroup = null;

  function highlightLayers(keys) {
    svgLayers.forEach(function (l) {
      l.classList.toggle('is-active', keys.indexOf(l.getAttribute('data-layer')) !== -1);
    });
    state.stack = LAYER_KEYS.map(function (k) { return keys.indexOf(k) !== -1 ? 1 : 0; });
  }

  function update() {
    ticking = false;
    updateCount++;
    var y = window.scrollY || window.pageYOffset;
    state.c = progressAt(y);

    // ==========================================
    // 1. DOM READ PHASE (Measurements only)
    // ==========================================

    var activeChapter = 0;
    for (var i = 0; i < tops.length; i++) if (tops[i] <= y + vh * 0.45) activeChapter = i;
    if (y >= maxScroll - 2) activeChapter = tops.length - 1;

    var frameReads = [];
    if (!state.reduced) {
      frames.forEach(function (f) {
        var r = f.getBoundingClientRect();
        if (r.bottom >= -200 && r.top <= vh + 200) {
          frameReads.push({ f: f, center: r.top + r.height / 2 - vh / 2 });
        }
      });
    }

    var line = vh * 0.55;
    var activeMilestone = 0;
    if (milestones.length) {
      milestones.forEach(function (m, i) {
        if (m.getBoundingClientRect().top <= line) activeMilestone = i;
      });
    }

    var timelineProgress = 0;
    if (timeline) {
      var tr = timeline.getBoundingClientRect();
      timelineProgress = clamp((line - tr.top) / Math.max(1, tr.height), 0, 1);
    }

    var currentGroup = null;
    var stackVisible = false;
    if (groups.length && !hoverGroup) {
      var sr = stackSection.getBoundingClientRect();
      if (sr.bottom >= 0 && sr.top <= vh) {
        stackVisible = true;
        groups.forEach(function (g) {
          if (g.getBoundingClientRect().top <= vh * 0.6) currentGroup = g;
        });
        if (!currentGroup && sr.top < vh * 0.5) currentGroup = groups[0];
      }
    }

    // ==========================================
    // 2. DOM WRITE PHASE (Mutations only)
    // ==========================================

    if (activeChapter !== state.chapter || updateCount === 1) setActiveChapter(activeChapter);
    if (railFill) railFill.style.transform = 'scaleY(' + clamp(y / maxScroll, 0, 1).toFixed(4) + ')';

    // updateFrames writes
    frameReads.forEach(function (item) {
      item.f.style.setProperty('--py', (item.center * -0.05).toFixed(1) + 'px');
    });

    // updateJourney writes
    if (milestones.length) {
      if (activeMilestone !== state.journey || updateCount === 1) {
        state.journey = activeMilestone;
        if (journeyCurrent) journeyCurrent.textContent = pad(activeMilestone);
        milestones.forEach(function (m, i) {
          m.classList.toggle('is-active', i === activeMilestone);
          m.classList.toggle('is-past', i < activeMilestone);
        });
      }
      if (timeline) {
        timeline.style.setProperty('--progress', timelineProgress.toFixed(4));
      }
    }

    // updateStack writes
    if (groups.length && !hoverGroup) {
      if (stackVisible) {
        if (currentGroup !== state.currentGroup || updateCount === 1) {
          state.currentGroup = currentGroup;
          groups.forEach(function (g) { g.classList.toggle('is-active', g === currentGroup); });
          highlightLayers(currentGroup ? currentGroup.getAttribute('data-layers').split(' ') : []);
        }
      } else {
        if (state.currentGroup !== null) {
          state.currentGroup = null;
          state.stack = [0, 0, 0, 0, 0, 0];
        }
      }
    }
  }

  function requestUpdate() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }

  groups.forEach(function (g) {
    g.addEventListener('pointerenter', function () {
      hoverGroup = g;
      groups.forEach(function (o) { o.classList.toggle('is-active', o === g); });
      highlightLayers(g.getAttribute('data-layers').split(' '));
    });
    g.addEventListener('pointerleave', function () { hoverGroup = null; requestUpdate(); });
  });

  /* ------------------------------------------------------------------
     Mobile menu
     ------------------------------------------------------------------ */
  var menuBtn = document.querySelector('.menu-toggle');
  var menu = document.getElementById('mobile-menu');
  function setMenu(open) {
    if (!menuBtn || !menu) return;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.querySelector('.menu-toggle__label').textContent = open ? 'Close' : 'Menu';
    menu.hidden = !open;
    doc.classList.toggle('menu-open', open);
    if (open) {
      var first = menu.querySelector('a');
      if (first) first.focus();
    }
  }
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', function () {
      setMenu(menuBtn.getAttribute('aria-expanded') !== 'true');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menuBtn.focus();
      }
      if (e.key === 'Tab' && !menu.hidden) {
        // keep focus inside the open menu (toggle + links)
        var items = [menuBtn].concat(Array.prototype.slice.call(menu.querySelectorAll('a')));
        var idx = items.indexOf(document.activeElement);
        if (e.shiftKey && idx <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && idx === items.length - 1) { e.preventDefault(); items[0].focus(); }
      }
    });
    window.matchMedia('(min-width: 1024px)').addEventListener('change', function (e) {
      if (e.matches) setMenu(false);
    });
  }

  /* move focus to the chapter after in-page navigation, for keyboard users */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    var target = id && document.getElementById(id);
    if (!target) return;
    window.setTimeout(function () {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }, state.reduced ? 0 : 650);
  });

  /* ------------------------------------------------------------------
     Project frames: pointer-driven image plane shift
     ------------------------------------------------------------------ */
  if (mqFine.matches) {
    frames.forEach(function (f) {
      f.addEventListener('pointermove', function (e) {
        if (state.reduced) return;
        var r = f.getBoundingClientRect();
        f.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        f.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      });
      f.addEventListener('pointerleave', function () {
        f.style.setProperty('--mx', '0');
        f.style.setProperty('--my', '0');
      });
    });
  }

  /* ------------------------------------------------------------------
     Case file dialog
     ------------------------------------------------------------------ */
  var dialog = document.getElementById('case');
  var lastOpener = null;
  function openCase(article, opener) {
    if (!dialog || typeof dialog.showModal !== 'function') {
      var link = article.querySelector('.build__frame');
      if (link) window.open(link.href, '_blank', 'noopener');
      return;
    }
    lastOpener = opener;
    var img = article.querySelector('.build__plane img');
    var visual = dialog.querySelector('.case__visual');
    visual.innerHTML = '';
    if (img) {
      var copy = new Image();
      copy.src = img.currentSrc || img.src;
      copy.alt = img.alt;
      copy.width = 1600; copy.height = 1000;
      visual.appendChild(copy);
    }
    var num = article.querySelector('.build__num');
    dialog.querySelector('.case__num').textContent = 'Case file ' + (num ? num.textContent.trim() : '');
    var title = article.querySelector('.build__title .sr-only') || article.querySelector('.build__title');
    dialog.querySelector('.case__title').textContent = title.textContent.trim();

    var desc = dialog.querySelector('.case__desc');
    desc.innerHTML = '';
    var more = article.querySelector('.build__more');
    var summary = article.querySelector('.build__desc');
    if (summary) { var p = document.createElement('p'); p.textContent = summary.textContent.trim(); desc.appendChild(p); }
    if (more) Array.prototype.forEach.call(more.children, function (node) { desc.appendChild(node.cloneNode(true)); });

    var meta = article.querySelector('.build__meta');
    dialog.querySelector('.case__meta').innerHTML = meta ? meta.innerHTML : '';
    var stack = article.querySelector('.build__stack');
    var caseStack = dialog.querySelector('.case__stack');
    caseStack.innerHTML = stack ? stack.innerHTML : '';
    caseStack.setAttribute('aria-label', stack ? stack.getAttribute('aria-label') : 'Technologies');

    var links = dialog.querySelector('.case__links');
    links.innerHTML = '';
    article.querySelectorAll('.build__actions .ext-link').forEach(function (a) { links.appendChild(a.cloneNode(true)); });

    dialog.showModal();
    doc.classList.add('dialog-open');
    var closeBtn = dialog.querySelector('[data-case-close]');
    if (closeBtn) closeBtn.focus();
  }
  if (dialog) {
    document.querySelectorAll('[data-case]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var article = document.getElementById(btn.getAttribute('data-case'));
        if (article) openCase(article, btn);
      });
    });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog || e.target.closest('[data-case-close]')) dialog.close();
    });
    dialog.addEventListener('close', function () {
      doc.classList.remove('dialog-open');
      if (lastOpener) lastOpener.focus();
    });
  }

  /* ------------------------------------------------------------------
     Custom cursor (fine pointers, never on touch)
     ------------------------------------------------------------------ */
  var cursor = document.querySelector('.cursor');
  var cursorOn = false;
  function setupCursor() {
    if (!cursor || cursorOn || !mqFine.matches) return;
    cursorOn = true;
    var dot = cursor.querySelector('.cursor__dot');
    var ring = cursor.querySelector('.cursor__ring');
    var x = -100, y = -100, rx = -100, ry = -100, raf = 0, moving = false;
    doc.classList.add('has-cursor');

    function loop() {
      var k = state.reduced ? 1 : 0.2;
      rx += (x - rx) * k;
      ry += (y - ry) * k;
      ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
      if (Math.abs(x - rx) > 0.1 || Math.abs(y - ry) > 0.1) raf = requestAnimationFrame(loop);
      else moving = false;
    }
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      x = e.clientX; y = e.clientY;
      dot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      cursor.classList.remove('is-hidden');
      if (!moving) { moving = true; raf = requestAnimationFrame(loop); }
    }, { passive: true });
    document.addEventListener('pointerover', function (e) {
      cursor.classList.toggle('is-hover', !!e.target.closest('a, button, [role="button"], summary'));
    });
    document.documentElement.addEventListener('pointerleave', function () { cursor.classList.add('is-hidden'); });
    window.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') { doc.classList.remove('has-cursor'); }
    }, { passive: true });
  }
  setupCursor();
  mqFine.addEventListener('change', function (e) {
    if (!e.matches) doc.classList.remove('has-cursor');
    else if (cursorOn) doc.classList.add('has-cursor');
    else setupCursor();
  });

  /* pointer position for world parallax */
  if (mqFine.matches) {
    window.addEventListener('pointermove', function (e) {
      state.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      state.pointerY = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  /* ------------------------------------------------------------------
     Reduced motion changes at runtime
     ------------------------------------------------------------------ */
  mqReduced.addEventListener('change', function (e) {
    state.reduced = e.matches;
    doc.classList.toggle('reduced-motion', e.matches);
    if (e.matches) {
      doc.classList.remove('reveal-ready');
      if (revealObserver) revealObserver.disconnect();
      frames.forEach(function (f) { f.style.removeProperty('--py'); });
    }
    window.dispatchEvent(new CustomEvent('portfolio:motion', { detail: { reduced: e.matches } }));
    requestUpdate();
  });

  /* ------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */
  measure();
  setupReveals();
  update();

  window.addEventListener('scroll', requestUpdate, { passive: true });
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { measure(); requestUpdate(); }, 120);
  });
  window.addEventListener('load', function () { measure(); requestUpdate(); });
  if ('ResizeObserver' in window) {
    new ResizeObserver(function () { measure(); requestUpdate(); }).observe(document.getElementById('main'));
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); requestUpdate(); });
})();
