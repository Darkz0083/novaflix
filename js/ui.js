'use strict';
/* Pure-ish render helpers: profiles, billboard, rails, preview, modal, grids. */
const $ = function (id) { return document.getElementById(id); };

let toastTimer = null;
function toast(m) {
  const t = $('toast');
  t.textContent = m;
  t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.style.display = 'none'; }, 1800);
}

function scoreOf(c) {
  const s = Number(c.score);
  return isFinite(s) && s > 0 ? s : 0;
}
function matchPct(c) {
  const s = scoreOf(c);
  return s > 0 ? Math.round((s > 10 ? s / 10 : s) * 10) + '%' : 'NEW';
}
function scoreTag(c) {
  const s = scoreOf(c);
  return s > 0 ? '<span class="scoreTag">★ ' + s.toFixed(1) + '</span>' : '';
}
function imgFallback(c) {
  const seed = encodeURIComponent(c.id || c.title || 'novaflix');
  return "this.onerror=null;this.src='https://picsum.photos/seed/" + seed + "/640/360'";
}
function itemCard(c, tall) {
  const img = c.backdrop || c.poster;
  const soon = c.upcoming
    ? '<div class="badgeSoon">SOON</div><div class="soon">' + esc(c.release) + ' • ▶ Trailer</div>'
    : '';
  return '<button class="card" data-id="' + esc(c.id) + '" aria-label="' + esc(c.title) + '"' + (tall ? ' style="flex:0 0 150px;height:215px"' : '') + '>' +
    (img ? '<img loading="lazy" src="' + esc(img) + '" alt="' + esc(c.title) + '" onerror="' + imgFallback(c) + '">' : '') + soon + scoreTag(c) + '</button>';
}

function gridCard(c) {
  const img = c.backdrop || c.poster;
  return '<button class="card" data-id="' + esc(c.id) + '" aria-label="' + esc(c.title) + '">' +
    (img ? '<img loading="lazy" src="' + esc(img) + '" alt="' + esc(c.title) + '" onerror="' + imgFallback(c) + '">' : '') +
    '<div class="soon"><b>' + esc(String(c.title).slice(0, 32)) + '</b><br>' + matchPct(c) + ' • ' + esc(c.year) + ' • ' + esc(c.maturity) + '</div></button>';
}

function rowHTML(title, items, sub) {
  if (!items.length) return '';
  const cards = items.map(function (c) { return itemCard(c, false); }).join('');
  return '<div class="row"><div class="rowHead"><h2>' + esc(title) + '</h2>' +
    (sub ? '<span class="rowSub">' + esc(sub) + '</span>' : '') + ' ' +
    '<button class="exp" data-action="explore">Explore All ›</button></div>' +
    '<div class="railWrap"><button class="arrow left" data-scroll="-1" aria-label="Scroll left">‹</button>' +
    '<div class="rail">' + cards + '</div>' +
    '<button class="arrow right" data-scroll="1" aria-label="Scroll right">›</button></div></div>';
}

function topCard(c, i) {
  const img = c.poster || c.backdrop;
  return '<button class="card topCard" data-id="' + esc(c.id) + '" aria-label="#' + (i + 1) + ' ' + esc(c.title) + '">' +
    (img ? '<img loading="lazy" src="' + esc(img) + '" alt="' + esc(c.title) + '" onerror="' + imgFallback(c) + '">' : '') +
    (c.upcoming ? '<div class="badgeSoon">SOON</div>' : '') + scoreTag(c) + '</button>';
}
function topHTML(title, items, sub) {
  if (!items.length) return '';
  const cards = items.map(function (c, i) {
    return '<div class="topWrap"><span class="bigN" aria-hidden="true">' + (i + 1) + '</span>' + topCard(c, i) + '</div>';
  }).join('');
  return '<div class="row"><div class="rowHead"><h2>' + esc(title) + '</h2>' +
    (sub ? '<span class="rowSub">' + esc(sub) + '</span>' : '') + '</div>' +
    '<div class="railWrap"><button class="arrow left" data-scroll="-1" aria-label="Scroll left">‹</button>' +
    '<div class="rail">' + cards + '</div>' +
    '<button class="arrow right" data-scroll="1" aria-label="Scroll right">›</button></div></div>';
}

function loadingRows(label) {
  return '<div class="row"><div class="rowHead"><h2>' + esc(label) + '</h2></div><div class="rail">' +
    "<div class='skel'></div>".repeat(6) + '</div></div>';
}

function renderBillboard(HERO, i, billboardOn) {
  const c = HERO[i];
  if (!c) return;
  ensureBillVideo();
  const vid = $('billVideo');
  if (billboardOn && c.trailerId) {
    vid.style.display = 'block';
    vid.src = 'https://www.youtube.com/embed/' + c.trailerId + '?autoplay=1&mute=1&controls=0&loop=1&playlist=' + c.trailerId + '&rel=0&playsinline=1';
    $('billBg').style.display = 'none';
  } else {
    vid.removeAttribute('src');
    vid.style.display = 'none';
    const bg = $('billBg');
    bg.style.display = 'block';
    bg.style.backgroundImage = c.backdrop ? "url('" + c.backdrop.replace(/'/g, '%27') + "')" : 'none';
  }
  if (c.logo) {
    $('billLogo').style.display = 'block';
    $('billLogo').src = c.logo;
    $('billTitle').style.display = 'none';
  } else {
    $('billLogo').style.display = 'none';
    $('billTitle').style.display = 'block';
    $('billTitle').textContent = c.title;
  }
  const kb = $('billKenburns');
  if (kb) {
    kb.style.backgroundImage = c.backdrop ? "url('" + c.backdrop.replace(/'/g, '%27') + "')" : 'none';
    kb.style.opacity = (!billboardOn || !c.trailerId) && c.backdrop ? 1 : 0;
  }
  $('billKickerText').textContent = (c.kind === 'series' ? 'SERIES' : c.kind === 'anime' ? 'ANIME' : 'FILM') + ' • #' + (i + 1) + ' TODAY';
  $('billDesc').textContent = c.desc || '';
  $('billMeta').innerHTML = '<span class="match">' + matchPct(c) + ' Match</span><span>' + esc(c.year) +
    '</span><span class="mBox">HD</span><span>' + esc(c.dur) + ' • ' + esc(String(c.kind).toUpperCase()) + '</span><span>' +
    esc((c.genres || []).slice(0, 3).join(' • ')) + '</span>';
  $('matBox').textContent = c.maturity;
  $('topText').textContent = '#' + (i + 1) + ' ' + (c.kind === 'series' ? 'Show' : c.kind === 'anime' ? 'Anime' : 'Movie') + ' Today';
  $('billDots').innerHTML = HERO.map(function (_, j) {
    return '<button class="dot' + (j === i ? ' on' : '') + '" data-bill="' + j + '" aria-label="Billboard ' + (j + 1) + '"></button>';
  }).join('');
}

function ensureBillVideo() {
  if ($('billVideo')) return;
  const f = document.createElement('iframe');
  f.id = 'billVideo';
  f.title = 'Billboard preview';
  f.allow = 'autoplay; encrypted-media';
  f.style.display = 'none';
  $('billboard').prepend(f);
}

function showPreviewFor(el, c, inListFn) {
  const pv = $('preview');
  pv.style.display = 'block';
  requestAnimationFrame(function () { pv.classList.add('show'); });
  const r = el.getBoundingClientRect();
  pv.style.position = 'absolute';
  pv.style.left = Math.min(Math.max(r.left - 40 + window.scrollX, 8), window.innerWidth - 360) + 'px';
  pv.style.top = (r.top + window.scrollY - 40) + 'px';
  pv.dataset.id = c.id;
  $('pImg').src = c.backdrop || c.poster || '';
  $('pMeta').innerHTML = '<span class="match">' + matchPct(c) + ' Match</span> ' +
    '<span class="mBox">' + esc(c.maturity) + '</span> <span>' + esc(c.dur) + '</span>';
  $('pGenres').textContent = (c.genres || []).join(' • ') || c.year;
  $('pList').textContent = inListFn(c.id) ? '✓' : '+';
  $('pList').classList.toggle('in', !!inListFn(c.id));
}

function hidePreview(force) {
  const pv = $('preview');
  pv.classList.remove('show');
  if (force) {
    pv.style.display = 'none';
  } else {
    setTimeout(function () {
      if (!pv.classList.contains('show')) pv.style.display = 'none';
    }, 220);
  }
  clearTimeout(hidePreview._t);
}

function renderModal(full, inList) {
  $('mHero').style.backgroundImage = full.backdrop || full.poster ? "url('" + (full.backdrop || full.poster).replace(/'/g, '%27') + "')" : 'none';
  if (full.logo) {
    $('mLogo').style.display = 'block';
    $('mLogo').src = full.logo;
    $('mTitle').style.display = 'none';
  } else {
    $('mLogo').style.display = 'none';
    $('mTitle').style.display = 'block';
    $('mTitle').textContent = full.title;
  }
  let days = '';
  if (full.upcoming) {
    const d = Math.ceil((new Date(full.release) - Date.now()) / 86400000);
    if (d > 0) days = ' • COMING IN ' + d + ' DAYS';
  }
  $('mMeta').innerHTML = (full.upcoming
    ? '<span style="background:var(--red);padding:2px 8px;border-radius:3px;font-size:12px">Coming Soon</span>'
    : '<span class="match">' + matchPct(full) + ' Match</span>') +
    (scoreOf(full) ? '<span>★ ' + scoreOf(full).toFixed(1) + '</span>' : '') +
    '<span>' + esc(full.year) + '</span><span>' + esc(full.dur) + '</span>' +
    '<span class="mBox">' + (full.kind === 'series' ? 'TV Series' : full.kind === 'anime' ? 'Anime' : 'Movie') + '</span>' +
    '<span class="mBox">' + esc(full.maturity) + '</span><span>' + esc(full.release) + esc(days) + '</span>' +
    '<span>' + esc((full.genres || []).slice(0, 3).join(' • ')) + '</span>';
  $('mDesc').textContent = full.desc || 'No synopsis yet.';
  $('mCast').innerHTML = '<span style="color:#777">Cast:</span> ' + esc((full.cast || []).slice(0, 8).join(', ') || 'Ensemble cast — full credits loading…') +
    '<br><span style="color:#777">Director:</span> ' + esc((full.director || []).join(', ') || '—') +
    '<br><span style="color:#777">Genres:</span> ' + esc((full.genres || []).join(', ') || full.year);
  $('mListBtn').textContent = inList ? '✓' : '+';
  $('mListBtn').classList.toggle('in', !!inList);
  $('trailerWrap').style.display = 'none';
  $('trailerWrap').innerHTML = '';
  $('trailFallback').innerHTML = '<a href="' + ytWatch(full.title) + '" target="_blank" rel="noopener" style="color:#aaa;font-size:13px">Open on YouTube ↗</a>';

  const vids = (full.fullMeta && full.fullMeta.videos) || [];
  let epsHtml = '';
  if (full.kind !== 'movie' && vids.length) {
    const seasons = Array.from(new Set(vids.map(function (v) { return v.season; }))).filter(function (s) { return s > 0; }).sort(function (a, b) { return a - b; });
    const s0 = seasons.length ? seasons[0] : 1;
    const list = vids.filter(function (v) { return v.season === s0; }).sort(function (a, b) { return a.episode - b.episode; });
    epsHtml = '<div style="margin-bottom:10px"><button class="season-btn">Season ' + s0 + ' • ' + list.length + ' episodes</button></div>' +
      list.map(function (ep) {
        return '<div class="ep"><div class="num">' + String(ep.episode).padStart(2, '0') + '</div>' +
          '<img loading="lazy" src="' + esc(ep.thumbnail || full.backdrop || '') + '" alt="">' +
          '<div><b>' + esc(ep.title || ep.name || ('Episode ' + ep.episode)) + '</b>' +
          '<div class="muted">' + esc(ep.released ? ep.released.slice(0, 10) : '') + '</div>' +
          '<div style="color:#bbb;font-size:13px">' + esc((ep.overview || '').slice(0, 120)) + '</div></div></div>';
      }).join('');
  } else if (full.kind !== 'movie') {
    epsHtml = '<div class="ep"><div class="num">01</div>' +
      '<img src="' + esc(full.backdrop || '') + '" alt="">' +
      '<div><b>' + esc(full.title) + ' — Series</b>' +
      '<div class="muted">' + esc(full.dur) + ' • ' + esc(full.maturity) + '</div>' +
      '<div style="color:#bbb;font-size:13px">' + esc((full.desc || '').slice(0, 140)) + '</div></div>' +
      '<button class="epPlay" data-action="play-current" aria-label="Play">▶</button></div>';
  } else {
    epsHtml = '<p class="muted">' + esc(full.title) + ' • ' + esc(full.dur) + ' film • ' + esc(full.release) + ' • ' + esc(full.maturity) + '</p>';
  }
  $('tab-eps').innerHTML = epsHtml;

  const tids = full.trailerIds || (full.trailerId ? [full.trailerId] : []);
  $('trailGrid').innerHTML = tids.length
    ? tids.map(function (yt, i) {
        return '<button class="trailer-tile' + (i === 0 ? ' active' : '') + '" data-trailer="' + i + '">' +
          '<img loading="lazy" src="' + ytThumb(yt) + '" alt=""><span>Trailer ' + (i + 1) + '</span></button>';
      }).join('')
    : "<p class='muted'>Trailer loading… use Open on YouTube below.</p>";

  $('tab-about').innerHTML = '<b style="color:#fff">' + esc(full.title) + '</b><br>Released: ' + esc(full.release) +
    '<br>Runtime: ' + esc(full.dur) + ' • ' + esc(full.kind) + ' • ' + esc(full.maturity) +
    '<br>Genres: ' + esc((full.genres || []).join(', ')) +
    '<br>Score: ' + Number(full.score).toFixed(1) + '/10' +
    '<br>Status: ' + (full.upcoming ? 'Coming Soon' : 'Released');
}
