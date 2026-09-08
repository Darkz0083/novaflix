'use strict';
/* App state + wiring + data loading. No inline handlers; event delegation only. */

const TOP10_MOVIES = [
  { t: 'The Whisper Man', y: '2026' }, { t: 'The Secret Woman', y: '2026' },
  { t: 'Facing El Chapo', y: '2026' }, { t: "Don't Say Good Luck", y: '2026' },
  { t: 'The Last House', y: '2026' }, { t: '72 Hours', y: '2026' },
  { t: 'Untold: The Testimony of Vince Young', y: '2026' }, { t: 'The Angry Birds Movie 2', y: '2019' },
  { t: '9 to 5', y: '1980' }, { t: 'Ready or Not', y: '2019' }
];
const TOP10_SHOWS = [
  { t: "Death of the Pastor's Wife", y: '2026' }, { t: 'Beauty in Black', y: '2024' },
  { t: 'Outer Banks', y: '2020' }, { t: 'Talamasca: The Secret Order', y: '2025' },
  { t: 'Leanne', y: '2025' }, { t: 'Blood Sacrifice', y: '2026' },
  { t: 'I Will Find You', y: '2025' }, { t: 'Stranger Things', y: '2016' },
  { t: 'Bridgerton', y: '2020' }, { t: 'One Piece', y: '2023' }
];

const DB = {};
let HERO = [];
let BILL_I = 0;
let billboardOn = false;
let billTimer = null;
let billProgTimer = null;
let currentItem = null;
let currentFilter = 'all';
let curPid = 'guest';
let activeTrailer = 0;
let previewTimer = null;
let hideTimer = null;
let searchTimer = null;
let browseType = 'all';
let listFilter = 'all';
let prefs = { billAuto: true, reduceMotion: false };
try {
  const stored = JSON.parse(localStorage.getItem('novaflix-prefs') || '{}');
  prefs = { billAuto: stored.billAuto !== false, reduceMotion: !!stored.reduceMotion };
} catch (e) { /* defaults stand */ }
function savePrefs() {
  try { localStorage.setItem('novaflix-prefs', JSON.stringify(prefs)); } catch (e) {}
}
function applyPrefs() {
  document.body.classList.toggle('reduceMotion', !!prefs.reduceMotion);
  const ab = $('autoplayBill');
  if (ab) ab.checked = !!prefs.billAuto;
  const rm = $('reduceMotion');
  if (rm) rm.checked = !!prefs.reduceMotion;
}

/* ---------- profiles / lists ---------- */
function profs() {
  try { return JSON.parse(localStorage.getItem('novaflix-profiles-v2') || '[]'); } catch (e) { return []; }
}
function saveProfs(p) { localStorage.setItem('novaflix-profiles-v2', JSON.stringify(p)); }
function kindOf(p) {
  if (p && p.kind) return p.kind;
  if (p && p.id === 'anime') return 'anime';
  if (p && p.id === 'kids') return 'kids';
  return 'all';
}
function getCurrentProfile() {
  const p = profs().find(function (x) { return x.id === curPid; });
  if (p) return { id: p.id, name: p.name, kind: kindOf(p) };
  return { id: curPid, name: curPid, kind: curPid === 'anime' ? 'anime' : curPid === 'kids' ? 'kids' : 'all' };
}
function listKey() { return 'novaflix-list-' + curPid; }
function remKey() { return 'novaflix-rem-' + curPid; }
function getMyList() {
  try { return JSON.parse(localStorage.getItem(listKey()) || '[]'); } catch (e) { return []; }
}
function getRem() {
  try { return JSON.parse(localStorage.getItem(remKey()) || '[]'); } catch (e) { return []; }
}
function inList(id) { return getMyList().some(function (x) { return x.id === id; }); }
function slimItem(c) {
  if (!c) return c;
  const slim = {};
  ['id', 'kind', 'tmdbId', 'tmdbKind', 'tt', 'title', 'poster', 'backdrop', 'logo', 'desc',
    'score', 'year', 'genres', 'cast', 'director', 'trailerIds', 'trailerId',
    'release', 'upcoming', 'maturity', 'dur'].forEach(function (k) { slim[k] = c[k]; });
  if (typeof slim.desc === 'string') slim.desc = slim.desc.slice(0, 600);
  if (Array.isArray(slim.cast)) slim.cast = slim.cast.slice(0, 8);
  if (Array.isArray(slim.genres)) slim.genres = slim.genres.slice(0, 5);
  if (Array.isArray(slim.trailerIds)) slim.trailerIds = slim.trailerIds.slice(0, 3);
  return slim;
}
function saveList(next) {
  try {
    localStorage.setItem(listKey(), JSON.stringify(next.map(slimItem)));
  } catch (e) {
    try {
      localStorage.setItem(listKey(), JSON.stringify(next.slice(-20).map(slimItem)));
      toast('My List full — kept the 20 newest');
    } catch (e2) { toast('Could not save My List (storage full)'); }
  }
}
function put(item) { DB[item.id] = item; return item; }

function renderGate() {
  let p = profs();
  if (!p.length) {
    p = [
      { id: 'you', name: 'You', c: '#E50914', e: '😎', kind: 'all' },
      { id: 'anime', name: 'Anime', c: '#7b00ff', e: '🍥', kind: 'anime' },
      { id: 'kids', name: 'Kids', c: '#00b2ff', e: '🧸', kind: 'kids' }
    ];
    saveProfs(p);
  } else {
    let dirty = false;
    p.forEach(function (x) { if (!x.kind) { x.kind = kindOf(x); dirty = true; } });
    if (dirty) saveProfs(p);
  }
  $('gateGrid').innerHTML = p.map(function (x) {
    const sub = x.kind === 'anime' ? 'Anime only' : x.kind === 'kids' ? 'Kids • PG & under' : 'All catalog';
    return '<button class="prof" data-profile="' + esc(x.id) + '"><span class="del" data-del-profile="' + esc(x.id) + '" aria-label="Delete">✕</span>' +
      '<span class="av" style="background:' + esc(x.c) + '">' + esc(x.e) + '</span><p>' + esc(x.name) + '</p>' +
      '<span class="sub">' + sub + '</span></button>';
  }).join('');
}

/* ---------- views ---------- */
const VIEWS = ['homeView', 'searchView', 'newView', 'listView', 'browseView'];
function showOnly(v) {
  VIEWS.forEach(function (id) { $(id).style.display = id === v ? 'block' : 'none'; });
}
function goHome() {
  showOnly('homeView');
  $('l-home').classList.add('active');
  $('q').value = '';
}
function paintBillboard() {
  renderBillboard(HERO, BILL_I, billboardOn);
  syncBillListBtn();
  restartBillProgress();
}
function nextBillboard() {
  if (!HERO.length) return;
  BILL_I = (BILL_I + 1) % HERO.length;
  billboardOn = false;
  paintBillboard();
}
function restartBillboard() {
  clearInterval(billTimer);
  if (!prefs.billAuto) return;
  billTimer = setInterval(function () {
    if (document.hidden) return;
    if (!$('homeView').offsetParent || !HERO.length) return;
    nextBillboard();
  }, 12000);
}
function restartBillProgress() {
  clearInterval(billProgTimer);
  const fill = $('billProgFill');
  if (!fill) return;
  fill.style.transition = 'none';
  fill.style.width = '0';
  if (!prefs.billAuto || !HERO.length) return;
  void fill.offsetWidth;
  fill.style.transition = 'width 12s linear';
  fill.style.width = '100%';
  billProgTimer = setInterval(function () {
    fill.style.transition = 'none';
    fill.style.width = '0';
    void fill.offsetWidth;
    fill.style.transition = 'width 12s linear';
    fill.style.width = '100%';
  }, 12000);
}
function syncBillListBtn() {
  const b = $('billListBtn');
  const c = HERO[BILL_I];
  if (!b || !c) return;
  const has = inList(c.id);
  b.classList.toggle('in', has);
  b.innerHTML = has ? '<span aria-hidden="true">✓</span> In My List' : '<span aria-hidden="true">＋</span> My List';
}

/* ---------- data loading ---------- */
async function resolveTitle(title, kind) {
  const ep = kind === 'series' ? '/search/tv' : '/search/movie';
  const r = await tmdb(ep + '?query=' + encodeURIComponent(title));
  const hit = (r.results || [])[0];
  if (!hit) return null;
  return tmdbToItem(hit, kind);
}

async function enrichHero(items) {
  await Promise.all(items.slice(0, 10).map(async function (c) {
    if (!c.tmdbId) return;
    const v = await tmdbSoft('/' + c.tmdbKind + '/' + c.tmdbId + '/videos');
    if (v) {
      const vids = (v.results || []).filter(function (x) { return x.site === 'YouTube' && (x.type === 'Trailer' || x.type === 'Teaser'); });
      c.trailerIds = vids.map(function (x) { return x.key; }).slice(0, 3);
      c.trailerId = c.trailerIds[0] || null;
    }
    const im = await tmdbSoft('/' + c.tmdbKind + '/' + c.tmdbId + '/images?include_image_language=en,null');
    if (im) {
      const b = bestLogo(im.logos || []);
      if (b) c.logo = TIMGO + b.file_path;
    }
  }));
  return items;
}

async function fetchKidSafe() {
  const r = await tmdb('/discover/movie?certification_country=US&certification.lte=PG&include_adult=false&with_genres=16,10751,12&sort_by=popularity.desc');
  return (r.results || []).map(function (m) {
    const it = tmdbToItem(m, 'movie');
    it.maturity = 'TV-PG';
    return it;
  });
}
async function fetchKidShows() {
  const r = await tmdb('/discover/tv?include_adult=false&with_genres=16,10762&sort_by=popularity.desc');
  return (r.results || []).map(function (m) {
    const it = tmdbToItem(m, 'series');
    it.maturity = 'TV-Y7';
    return it;
  });
}

let homeToken = 0;
async function loadHome() {
  const myHome = ++homeToken;
  showOnly('homeView');
  const prof = getCurrentProfile();
  const isAnime = prof.kind === 'anime';
  const isKids = prof.kind === 'kids';
  $('srcBadge').textContent = isAnime ? '● ANIME ONLY' : isKids ? '● KIDS • PG & UNDER' : '● NETFLIX SEPT 2026';
  $('rows').innerHTML = loadingRows('Loading ' + (isAnime ? 'Anime' : isKids ? 'Kids' : 'Netflix Sept 2026') + '…') +
    loadingRows('More coming…');

  let anime = [];
  try {
    anime = (await jTop()).map(function (a) { return put(animeToItem(a)); });
  } catch (e) { anime = []; }
  if (myHome !== homeToken) return;

  if (isAnime) return loadAnimeHome(anime, myHome);
  if (isKids) return loadKidsHome(anime, myHome);
  return loadFullHome(anime, myHome);
}

function paintRows(html) { $('rows').innerHTML = html; }

function staleHome(myHome) {
  return myHome !== homeToken;
}
async function loadAnimeHome(anime, myHome) {
  if (staleHome(myHome)) return;
  if (!anime.length) {
    try {
      const cs = await cinCat('series', 'top');
      anime = cs.slice(0, 12).map(cinToItem).map(put);
    } catch (e) { anime = []; }
    if (staleHome(myHome)) return;
  }
  HERO = anime.slice(0, 5);
  BILL_I = 0; billboardOn = false;
  paintBillboard();
  renderBell(); restartBillboard();
  let html = '';
  html += topHTML('Top 10 Anime Today', anime.slice(0, 10));
  html += rowHTML('Anime Series • Sub & Dub', anime);
  html += rowHTML('Anime Movies', anime.slice(0, 12));
  html += rowHTML('Coming Soon Anime 🍿', anime.filter(function (x) { return x.upcoming; }).slice(0, 10));
  if (getMyList().length) html += rowHTML('My List', getMyList().filter(function (x) { return x.kind === 'anime'; }));
  if (!html) html = '<p class="emptyRow">Anime catalog failed to load — check your connection, then Settings ⚙️ → Save + Reload.</p>';
  if (staleHome(myHome)) return;
  paintRows(html);
  $('browseGrid').innerHTML = anime.slice(0, 18).map(gridCard).join('');
}

async function loadKidsHome(anime, myHome) {
  let kidM = [], kidS = [];
  try { kidM = (await fetchKidSafe()).map(put); } catch (e) { kidM = []; }
  if (staleHome(myHome)) return;
  try { kidS = (await fetchKidShows()).map(put); } catch (e) { kidS = []; }
  if (staleHome(myHome)) return;
  if (!kidM.length && !kidS.length) {
    try {
      const cm = await cinCat('movie', 'top');
      const cs = await cinCat('series', 'top');
      kidM = cm.slice(0, 12).map(cinToItem).map(put);
      kidS = cs.slice(0, 12).map(cinToItem).map(put);
    } catch (e) { /* stay empty, message below */ }
    if (staleHome(myHome)) return;
  }
  const kidA = anime.filter(isKidSafeCard).slice(0, 14);
  HERO = kidM.slice(0, 2).concat(kidS.slice(0, 2), kidA.slice(0, 1)).filter(Boolean);
  if (!HERO.length) HERO = kidM.concat(kidS).slice(0, 5);
  await enrichHero(HERO);
  if (staleHome(myHome)) return;
  HERO.forEach(put);
  BILL_I = 0; billboardOn = false;
  paintBillboard();
  renderBell(); restartBillboard();
  let html = '';
  html += topHTML('Top 10 Kids Movies Today', kidM.slice(0, 10));
  html += topHTML('Top 10 Kids Shows Today', kidS.slice(0, 10));
  html += rowHTML('Kids Movies • PG & Under', kidM);
  html += rowHTML('Kids Shows • Animation', kidS);
  html += rowHTML('Kid Anime • Safe', kidA);
  if (getMyList().length) html += rowHTML('My List', getMyList().filter(isKidSafeCard));
  if (!html) html = '<p class="emptyRow">Kids catalog failed to load — check your connection, then Settings ⚙️ → Save + Reload.</p>';
  paintRows(html);
  $('browseGrid').innerHTML = kidM.concat(kidS).slice(0, 18).map(gridCard).join('');
}

async function loadFullHome(anime, myHome) {
  let topM = [], topS = [];
  try {
    topM = (await Promise.all(TOP10_MOVIES.map(function (o) { return resolveTitle(o.t, 'movie').catch(function () { return null; }); }))).filter(Boolean).map(put);
    topS = (await Promise.all(TOP10_SHOWS.map(function (o) { return resolveTitle(o.t, 'series').catch(function () { return null; }); }))).filter(Boolean).map(put);
  } catch (e) { /* fall through to cinemeta */ }
  if (staleHome(myHome)) return;
  if (topM.length < 6) {
    try { topM = (await cinCat('movie', 'top')).slice(0, 10).map(cinToItem).map(put); } catch (e) { topM = []; }
  }
  if (staleHome(myHome)) return;
  if (topS.length < 6) {
    try { topS = (await cinCat('series', 'top')).slice(0, 10).map(cinToItem).map(put); } catch (e) { topS = []; }
  }
  if (staleHome(myHome)) return;

  let trend = [], popM = [], popS = [], upM = [], newS = [];
  try {
    const res = await Promise.all([
      tmdb('/trending/all/week'), tmdb('/movie/popular'), tmdb('/tv/popular'), tmdb('/movie/upcoming'),
      fetchJson('https://api.themoviedb.org/3/discover/tv?api_key=' + encodeURIComponent(getKey()) + '&first_air_date_year=2026&sort_by=popularity.desc')
    ]);
    trend = (res[0].results || []).filter(function (x) { return x.media_type !== 'person'; })
      .map(function (x) { return put(tmdbToItem(x, x.media_type === 'tv' ? 'series' : 'movie')); });
    popM = (res[1].results || []).map(function (m) { return put(tmdbToItem(m, 'movie')); });
    popS = (res[2].results || []).map(function (m) { return put(tmdbToItem(m, 'series')); });
    upM = (res[3].results || []).map(function (m) { return put(tmdbToItem(m, 'movie')); });
    newS = (res[4].results || []).map(function (m) { return put(tmdbToItem(m, 'series')); });
  } catch (e) {
    try {
      const cm = await cinCat('movie', 'top');
      const cs = await cinCat('series', 'top');
      trend = cm.slice(0, 9).concat(cs.slice(0, 9)).map(cinToItem).map(put);
      popM = cm.map(cinToItem).map(put);
      popS = cs.map(cinToItem).map(put);
      upM = cm.slice(0, 10).map(cinToItem).map(put);
      newS = cs.slice(0, 10).map(cinToItem).map(put);
    } catch (e2) { /* rows stay empty below */ }
  }
  if (staleHome(myHome)) return;

  HERO = [topM[0], topS[0], topM[1], topS[1], topM[2]].filter(Boolean);
  if (!HERO.length) HERO = popM.concat(popS).slice(0, 5);
  await enrichHero(HERO);
  if (staleHome(myHome)) return;
  HERO.forEach(put);
  BILL_I = 0; billboardOn = false;
  paintBillboard();
  renderBell(); restartBillboard();

  const seen = {};
  const uniq = function (arr) {
    return arr.filter(function (c) {
      if (!c || seen[c.id]) return false;
      seen[c.id] = 1;
      return true;
    });
  };
  let html = '';
  html += topHTML('Top 10 Movies in the U.S. Today', uniq(topM.slice(0, 10)), 'Updated weekly');
  html += topHTML('Top 10 TV Shows in the U.S. Today', uniq(topS.slice(0, 10)), 'Updated weekly');
  html += rowHTML('New on Netflix This Week', uniq(newS.slice(0, 9).concat(upM.slice(0, 9))), 'Fresh drops');
  html += rowHTML('Trending Now', uniq(trend.slice(0, 18)), 'What everyone is watching');
  html += rowHTML('Popular Movies', uniq(popM.slice(0, 18)));
  html += rowHTML('Popular Series', uniq(popS.slice(0, 18)));
  html += rowHTML('Top Anime • Sub & Dub', uniq(anime), anime.length ? 'Via Jikan' : '');
  html += rowHTML('Because You Watched ' + ((topM[0] && topM[0].title) || 'Trending'), uniq(popM.slice(5, 14).concat(popS.slice(3, 12))), 'Picked for you');
  html += rowHTML('Coming Soon • Remind Me 🍿', uniq(upM.slice(0, 12).concat(newS.slice(0, 6))), 'Set a reminder');
  if (getMyList().length) html += rowHTML('My List', uniq(getMyList().slice(0, 18)), 'Continue any time');
  if (!html) html = '<p class="emptyRow">Catalog failed to load — check your connection, then open Settings ⚙️ to verify the TMDB key and hit Save + Reload.</p>';
  paintRows(html);
  paintBrowse(topM.concat(topS));
}

/* ---------- search / lists / browse ---------- */
function onSearch(v) {
  clearTimeout(searchTimer);
  if (!v.trim()) { goHome(); return; }
  searchTimer = setTimeout(function () { doSearch(v.trim()); }, 350);
}

let searchToken = 0;
async function doSearch(q) {
  const mySearch = ++searchToken;
  showOnly('searchView');
  const pr = getCurrentProfile();
  $('searchTitle').textContent = (pr.kind === 'anime' ? 'Anime results for "' : pr.kind === 'kids' ? 'Kids results for "' : 'Results for "') + q + '"';
  $('searchSub').textContent = 'Searching…';
  $('grid').innerHTML = "<div class='skel'></div>".repeat(6);
  let merged = [];
  try {
    const r = await tmdb('/search/multi?query=' + encodeURIComponent(q) + '&include_adult=false');
    merged = (r.results || []).filter(function (x) { return x.media_type !== 'person'; })
      .map(function (x) { return tmdbToItem(x, x.media_type === 'tv' ? 'series' : 'movie'); });
  } catch (e) {
    try {
      const m1 = await fetchJson(CIN + '/catalog/movie/top/search=' + encodeURIComponent(q) + '.json').then(function (j) { return j.metas || []; }).catch(function () { return []; });
      const s1 = await fetchJson(CIN + '/catalog/series/top/search=' + encodeURIComponent(q) + '.json').then(function (j) { return j.metas || []; }).catch(function () { return []; });
      merged = m1.concat(s1).map(cinToItem);
    } catch (e2) { merged = []; }
  }
  try {
    const jk = await jSearch(q);
    merged = merged.concat(jk.map(function (a) { return animeToItem(a); }));
  } catch (e) { /* anime optional */ }
  if (mySearch !== searchToken) return;
  if (pr.kind === 'anime') merged = merged.filter(function (c) { return c.kind === 'anime'; });
  if (pr.kind === 'kids') merged = merged.filter(isKidSafeCard);
  if (currentFilter === 'upcoming') merged = merged.filter(function (c) { return c.upcoming; });
  if (currentFilter !== 'all' && currentFilter !== 'upcoming') merged = merged.filter(function (c) { return c.kind === currentFilter; });
  merged.forEach(put);
  $('searchSub').textContent = merged.length ? merged.length + ' results' : '';
  $('grid').innerHTML = merged.length
    ? merged.map(gridCard).join('')
    : "<p class='muted'>No results for this profile.</p>";
}

function profilePool() {
  const pr = getCurrentProfile();
  return Object.values(DB).filter(function (x) {
    if (pr.kind === 'anime') return x.kind === 'anime';
    if (pr.kind === 'kids') return isKidSafeCard(x);
    return true;
  });
}

function showNewView() {
  showOnly('newView');
  let ups = profilePool().filter(function (x) { return x.upcoming; });
  if (!ups.length) ups = profilePool().slice(0, 12);
  const rem = getRem();
  $('newGrid').innerHTML = ups.length ? ups.map(function (c) {
    const on = rem.indexOf(c.id) >= 0;
    return '<article class="newCard" data-id="' + esc(c.id) + '"><img loading="lazy" src="' + esc(c.backdrop || c.poster || '') + '" alt="' + esc(c.title) + '">' +
      '<div class="pad"><b>' + esc(c.title) + '</b>' +
      '<div class="muted">' + matchPct(c) + ' • ' + esc(c.release) + ' • ' + esc(c.maturity) + '</div>' +
      '<div style="font-size:13px;color:#bbb">' + esc((c.desc || '').slice(0, 120)) + '...</div>' +
      '<div class="btnRow"><button class="btn btn-play" style="padding:8px 18px;font-size:14px" data-open="' + esc(c.id) + '">▶ Trailer</button> ' +
      '<button class="remBtn' + (on ? ' on' : '') + '" data-remind="' + esc(c.id) + '">' + (on ? '✓ Reminded' : '🔔 Remind Me') + '</button></div></div></article>';
  }).join('') : "<p class='muted'>Nothing new yet — check back soon.</p>";
}

function showListView() {
  showOnly('listView');
  paintList();
}

function paintList() {
  let l = getMyList();
  if (listFilter !== 'all') l = l.filter(function (x) { return x.kind === listFilter; });
  $('listToolbar').hidden = !getMyList().length;
  document.querySelectorAll('#listPills .pill').forEach(function (p) {
    p.classList.toggle('on', p.dataset.listfilter === listFilter);
  });
  $('listGrid').innerHTML = l.length
    ? l.map(gridCard).join('')
    : (getMyList().length
      ? "<p class='muted'>No " + esc(listFilter) + " in your list yet.</p>"
      : "<p class='muted'>Empty. Hover any title → + My List, or open it → +.</p>");
}

function allGenres() {
  const g = {};
  Object.values(DB).forEach(function (c) { (c.genres || []).forEach(function (x) { g[x] = 1; }); });
  return Object.keys(g).sort();
}

function paintBrowse(seed) {
  const sel = $('browseGenre');
  if (sel && !sel.options.length) sel.innerHTML = '<option value="">All genres</option>';
  if (sel && sel.options.length <= 1) {
    allGenres().forEach(function (g) {
      const o = document.createElement('option');
      o.value = g;
      o.textContent = g;
      sel.appendChild(o);
    });
  }
  let pool = profilePool();
  if (seed && seed.length && pool.length < 10) pool = seed;
  const genre = sel ? sel.value : '';
  const sort = $('browseSort') ? $('browseSort').value : 'pop';
  let list = pool.filter(function (c) {
    if (browseType !== 'all' && c.kind !== browseType) return false;
    if (genre && (c.genres || []).indexOf(genre) < 0) return false;
    return true;
  });
  list.sort(function (a, b) {
    if (sort === 'score') return scoreOf(b) - scoreOf(a);
    if (sort === 'new') return String(b.release).localeCompare(String(a.release));
    if (sort === 'az') return String(a.title).localeCompare(String(b.title));
    return scoreOf(b) - scoreOf(a);
  });
  list = list.slice(0, 60);
  $('browseCount').textContent = list.length ? list.length + ' titles' : 'No titles match — try clearing filters.';
  $('browseGrid').innerHTML = list.length ? list.map(gridCard).join('') : '';
}

/* ---------- detail / player ---------- */
function openById(id) {
  const c = DB[id];
  if (c) { hidePreview(true); openDetail(c, false); }
}

let detailToken = 0;
async function openDetail(c, auto) {
  const myToken = ++detailToken;
  currentItem = c;
  hidePreview(true);
  activeTrailer = 0;
  $('modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  renderModal(c, inList(c.id));
  switchTabEl('eps');

  if (c.tmdbId) {
    const d = await tmdbSoft('/' + c.tmdbKind + '/' + c.tmdbId + '?append_to_response=videos,credits,images&include_image_language=en,null');
    if (d && myToken === detailToken && currentItem && currentItem.id === c.id) {
      const vids = ((d.videos || {}).results || []).filter(function (x) { return x.site === 'YouTube' && (x.type === 'Trailer' || x.type === 'Teaser'); });
      const best = bestLogo((d.images && d.images.logos) || []);
      const full = Object.assign({}, c, {
        title: d.title || d.name || c.title,
        desc: d.overview || c.desc,
        score: d.vote_average || c.score,
        genres: (d.genres || []).length ? d.genres.map(function (g) { return g.name; }) : c.genres,
        cast: ((d.credits || {}).cast || []).slice(0, 8).map(function (x) { return x.name; }),
        director: ((d.credits || {}).crew || []).filter(function (x) { return x.job === 'Director'; }).map(function (x) { return x.name; }),
        trailerIds: vids.map(function (x) { return x.key; }).slice(0, 3),
        logo: best ? TIMGO + best.file_path : c.logo,
        backdrop: d.backdrop_path ? TIMGB + d.backdrop_path : c.backdrop,
        poster: d.poster_path ? TIMG + d.poster_path : c.poster,
        release: (d.release_date || d.first_air_date || c.release).slice(0, 10)
      });
      full.trailerId = full.trailerIds[0] || c.trailerId;
      currentItem = put(full);
      if ($('modal').style.display === 'flex') renderModal(full, inList(full.id));
    }
  } else if (c.kind === 'anime' && !c.logo) {
    try {
      const r = await tmdbSoft('/search/multi?query=' + encodeURIComponent(c.title) + '&include_adult=false');
      const hit = r && (r.results || []).find(function (x) { return x.media_type !== 'person'; });
      if (hit) {
        const k2 = hit.media_type === 'tv' || hit.first_air_date ? 'tv' : 'movie';
        const im = await tmdbSoft('/' + k2 + '/' + hit.id + '/images?include_image_language=en,null');
        const b = im && bestLogo(im.logos || []);
        if (b && myToken === detailToken && currentItem && currentItem.id === c.id) {
          const full = Object.assign({}, c, { logo: TIMGO + b.file_path });
          currentItem = put(full);
          if ($('modal').style.display === 'flex') renderModal(full, inList(full.id));
        }
      }
    } catch (e) { /* logo optional */ }
  } else if (c.tt) {
    try {
      const meta = await cinMeta(c.kind === 'anime' ? 'movie' : c.kind, c.tt);
      if (meta && myToken === detailToken && currentItem && currentItem.id === c.id) {
        const item = cinToItem(Object.assign({}, meta, { type: c.kind === 'anime' ? 'movie' : c.kind }));
        item.id = c.id;
        const full = Object.assign({}, c, item, { fullMeta: meta });
        currentItem = put(full);
        if ($('modal').style.display === 'flex') renderModal(full, inList(full.id));
      }
    } catch (e) { /* optional */ }
  }
  if (auto) playCurrent();
}

function closeModal() {
  detailToken++;
  $('modal').style.display = 'none';
  document.body.style.overflow = 'auto';
  $('trailerWrap').innerHTML = '';
}

function switchTabEl(k) {
  document.querySelectorAll('.tabs span').forEach(function (s) {
    s.classList.toggle('on', s.dataset.tab === k);
  });
  ['eps', 'more', 'trail', 'about'].forEach(function (t) {
    $('tab-' + t).style.display = t === k ? 'block' : 'none';
  });
}

async function playCurrent() {
  const c = currentItem;
  if (!c) return;
  let ids = c.trailerIds || (c.trailerId ? [c.trailerId] : []);
  if (c.tmdbId && !ids.length) {
    const v = await tmdbSoft('/' + c.tmdbKind + '/' + c.tmdbId + '/videos');
    if (v) {
      ids = (v.results || []).filter(function (x) { return x.site === 'YouTube' && x.type === 'Trailer'; }).map(function (x) { return x.key; });
      c.trailerIds = ids;
      c.trailerId = ids[0];
    }
  }
  const yt = ids[activeTrailer] || ids[0];
  $('player').style.display = 'flex';
  $('playerTitle').textContent = c.title;
  $('playerYT').href = yt ? 'https://www.youtube.com/watch?v=' + yt : ytWatch(c.title);
  if (!yt) {
    $('loadSpin').innerHTML = 'No embeddable trailer. <a href="' + ytWatch(c.title) + '" target="_blank" rel="noopener" style="color:#fff">Open on YouTube ↗</a>';
    return;
  }
  $('loadSpin').style.display = 'none';
  $('playerFrame').src = ytEmbed(yt);
  if ($('modal').style.display === 'flex') {
    $('trailerWrap').style.display = 'block';
    $('trailerWrap').innerHTML = '<iframe src="' + ytEmbed(yt) + '" title="Trailer" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
  }
  // Refresh the More Like This row now that DB grew.
  const more = Object.values(DB).filter(function (x) { return x.id !== c.id && x.kind === c.kind; }).slice(0, 6);
  if (more.length) {
    $('tab-more').innerHTML = '<div class="simGrid">' + more.map(function (x) {
      return '<button class="sim" data-open="' + esc(x.id) + '"><img loading="lazy" src="' + esc(x.backdrop || x.poster || '') + '" alt="">' +
        '<div class="pad"><span class="match">' + Math.round(x.score * 10) + '% Match</span><br><b>' +
        esc(String(x.title).slice(0, 28)) + '</b><br>' + esc(x.year) + '</div></button>';
    }).join('') + '</div>';
  }
}

function closePlayer() {
  $('player').style.display = 'none';
  $('playerFrame').removeAttribute('src');
  $('loadSpin').style.display = 'block';
  $('loadSpin').textContent = 'Loading trailer…';
}

function refreshListButtons(id, has) {
  const label = has ? '✓' : '+';
  if (currentItem && currentItem.id === id) {
    $('mListBtn').textContent = label;
    $('mListBtn').classList.toggle('in', has);
    $('pList').textContent = label;
    $('pList').classList.toggle('in', has);
  }
  syncBillListBtn();
}
function toggleCurrent() {
  if (!currentItem) return;
  const l = getMyList();
  const has = inList(currentItem.id);
  const next = has ? l.filter(function (x) { return x.id !== currentItem.id; }) : l.concat([slimItem(currentItem)]);
  saveList(next);
  refreshListButtons(currentItem.id, !has);
  toast(has ? 'Removed from My List' : 'Added to My List');
}

function toggleRemindId(id) {
  if (typeof id !== 'string') {
    if (!currentItem) return;
    id = currentItem.id;
  }
  let r = getRem();
  const has = r.indexOf(id) >= 0;
  r = has ? r.filter(function (x) { return x !== id; }) : r.concat([id]);
  localStorage.setItem(remKey(), JSON.stringify(r));
  document.querySelectorAll('[data-remind="' + id + '"]').forEach(function (btn) {
    btn.textContent = has ? '🔔 Remind Me' : '✓ Reminded';
    btn.classList.toggle('on', !has);
  });
  toast(has ? 'Reminder removed' : '🔔 Reminder set');
}

function renderBell() {
  const up = Object.values(DB).filter(function (x) { return x.upcoming; }).slice(0, 6);
  const ping = $('bellPing');
  if (ping) ping.hidden = !up.length;
  $('bellDrop').innerHTML = up.length
    ? up.map(function (x) {
        return '<button class="dropItem" data-open="' + esc(x.id) + '"><img loading="lazy" src="' + esc(x.backdrop || '') + '" alt="">' +
          '<span><b>' + esc(String(x.title).slice(0, 30)) + '</b><br><span style="color:#aaa;font-size:12px">' +
          esc(x.release) + ' • Trailer</span></span></button>';
      }).join('')
    : "<div style='padding:16px;color:#aaa'>No new drops</div>";
}

/* ---------- global events (delegation) ---------- */
function closestCard(el) {
  return el.closest ? el.closest('.card,.topWrap,.newCard,.sim,#preview') : null;
}

function bindEvents() {
  document.addEventListener('click', function (e) {
    const t = e.target;
    const q = function (sel) { return t.closest ? t.closest(sel) : null; };

    const del = q('[data-del-profile]');
    if (del) {
      e.stopPropagation();
      saveProfs(profs().filter(function (x) { return x.id !== del.dataset.delProfile; }));
      renderGate();
      return;
    }
    const prof = q('[data-profile]');
    if (prof) { enterProfile(prof.dataset.profile); return; }

    const actFirst = q('[data-action]');
    if (actFirst) { handleAction(actFirst.dataset.action, actFirst, e); return; }
    const open = q('[data-open]');
    if (open) { openById(open.dataset.open); return; }
    const remind = q('[data-remind]');
    if (remind) { e.stopPropagation(); toggleRemindId(remind.dataset.remind); return; }
    const card = q('#rows .card, #rows .newCard, #grid .card, #listGrid .card, #browseGrid .card, #newGrid .newCard, #tab-more .sim');
    if (card && card.dataset.id && !q('[data-remind]')) { openById(card.dataset.id); return; }

    const bill = q('[data-bill]');
    if (bill) {
      BILL_I = Number(bill.dataset.bill);
      billboardOn = false;
      paintBillboard();
      restartBillboard();
      return;
    }
    const sc = q('[data-scroll]');
    if (sc) {
      const rail = sc.parentElement.querySelector('.rail');
      if (rail) rail.scrollBy({ left: Number(sc.dataset.scroll) * window.innerWidth * 0.9, behavior: 'smooth' });
      return;
    }
    const pill = q('#pillBar .pill');
    if (pill) {
      currentFilter = pill.dataset.filter;
      document.querySelectorAll('#pillBar .pill').forEach(function (p) { p.classList.remove('on'); });
      pill.classList.add('on');
      if ($('q').value) doSearch($('q').value);
      return;
    }
    const lpill = q('#listPills .pill');
    if (lpill) {
      listFilter = lpill.dataset.listfilter;
      paintList();
      return;
    }
    const bpill = q('#browseType .pill');
    if (bpill) {
      browseType = bpill.dataset.btype;
      document.querySelectorAll('#browseType .pill').forEach(function (p) { p.classList.remove('on'); });
      bpill.classList.add('on');
      paintBrowse();
      return;
    }
    const tabEl = q('.tabs span[data-tab]');
    if (tabEl) { switchTabEl(tabEl.dataset.tab); return; }
    const tr = q('[data-trailer]');
    if (tr) {
      activeTrailer = Number(tr.dataset.trailer);
      document.querySelectorAll('.trailer-tile').forEach(function (el2, j) { el2.classList.toggle('active', j === activeTrailer); });
      playCurrent();
      return;
    }

    return;
  });

  document.addEventListener('mouseover', function (e) {
    const card = closestCard(e.target);
    if (!card || !card.dataset || !card.dataset.id) return;
    if (typeof isVerticalCard === 'function' && isVerticalCard(card)) return;
    clearTimeout(previewTimer);
    clearTimeout(hideTimer);
    previewTimer = setTimeout(function () { showPreviewFor(card, DB[card.dataset.id], inList); }, 70);
  });
  document.addEventListener('mouseout', function (e) {
    const to = e.relatedTarget;
    if (to && to.closest && (to.closest('#preview') || closestCard(to))) return;
    clearTimeout(previewTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { hidePreview(false); }, 120);
  });
  document.addEventListener('scroll', function () { hidePreview(true); }, true);

  $('preview').addEventListener('mouseleave', function () { hidePreview(false); });
  $('preview').addEventListener('mouseenter', function () { clearTimeout(hideTimer); });

  window.addEventListener('scroll', function () { $('nav').classList.toggle('scrolled', window.scrollY > 30); });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== $('q')) { e.preventDefault(); $('q').focus(); }
    if (e.key === 'Escape') { closeModal(); closePlayer(); hidePreview(true); closeSettings(); }
  });
  $('q').addEventListener('input', function (e) { onSearch(e.target.value); });
  $('modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });
}

function handleAction(action, el, e) {
  switch (action) {
    case 'add-profile': {
      const n = prompt('Profile name?');
      if (!n) return;
      const p = profs();
      p.push({ id: 'p' + Date.now(), name: n.slice(0, 12), c: '#' + Math.floor(Math.random() * 16777215).toString(16), e: '🔥', kind: 'all' });
      saveProfs(p);
      renderGate();
      return;
    }
    case 'guest': enterGuest(); return;
    case 'home': goHome(); return;
    case 'shows': {
      const pr = getCurrentProfile();
      if (!Object.keys(DB).length) { toast('Loading catalog… one sec'); loadHome(); return; }
      goHome();
      setTimeout(function () {
        const rows = Array.from(document.querySelectorAll('.row'));
        const needle = pr.kind === 'anime' ? 'Anime Series' : pr.kind === 'kids' ? 'Kids Shows' : 'Top 10 TV';
        const found = rows.find(function (r) { return r.textContent.indexOf(needle) >= 0; });
        if (found) found.scrollIntoView({ behavior: 'smooth' });
        else toast('Still loading — try again in a few seconds');
      }, 600);
      return;
    }
    case 'movies': {
      const pr = getCurrentProfile();
      if (!Object.keys(DB).length) { toast('Loading catalog… one sec'); loadHome(); return; }
      goHome();
      setTimeout(function () {
        const rows = Array.from(document.querySelectorAll('.row'));
        const needle = pr.kind === 'anime' ? 'Anime Movies' : pr.kind === 'kids' ? 'Kids Movies' : 'Top 10 Movies';
        const found = rows.find(function (r) { return r.textContent.indexOf(needle) >= 0; });
        if (found) found.scrollIntoView({ behavior: 'smooth' });
        else toast('Still loading — try again in a few seconds');
      }, 600);
      return;
    }
    case 'new': showNewView(); setActiveNav(el); return;
    case 'list': listFilter = 'all'; showListView(); setActiveNav(el); return;
    case 'clear-list':
      if (!getMyList().length) return;
      if (!confirm('Remove all titles from My List for this profile?')) return;
      try { localStorage.setItem(listKey(), '[]'); } catch (e) {}
      paintList();
      toast('My List cleared');
      return;
    case 'browse': showOnly('browseView'); paintBrowse(); setActiveNav(el); return;
    case 'explore': showOnly('browseView'); return;
    case 'bell':
      e.stopPropagation();
      $('profDrop').classList.remove('show');
      $('bellDrop').classList.toggle('show');
      renderBell();
      return;
    case 'profiles':
      e.stopPropagation();
      $('bellDrop').classList.remove('show');
      $('profDrop').classList.toggle('show');
      $('profDrop').innerHTML = profs().map(function (p) {
        return '<button class="dropItem" data-profile="' + esc(p.id) + '"><span class="avatar">' + esc(p.name[0]) + '</span>' +
          '<span>' + esc(p.name) + '<br><span style="color:#888;font-size:11px">' + esc(p.kind || 'all') + '</span></span></button>';
      }).join('') + '<button class="dropItem" data-action="switch">🔄 Switch Profiles</button>';
      return;
    case 'switch':
      $('app').style.display = 'none';
      $('gate').style.display = 'flex';
      renderGate();
      $('profDrop').classList.remove('show');
      return;
    case 'settings':
      openSettings();
      return;
    case 'close-settings': closeSettings(); return;
    case 'save-key':
      try { localStorage.setItem('novaflix-tmdb-key', $('keyInput').value.trim()); } catch (e) {}
      prefs.billAuto = !!($('autoplayBill') && $('autoplayBill').checked);
      prefs.reduceMotion = !!($('reduceMotion') && $('reduceMotion').checked);
      savePrefs();
      applyPrefs();
      restartBillboard();
      restartBillProgress();
      $('keyStatus').textContent = 'Saved ✓ Reloading catalog…';
      closeSettings();
      loadHome();
      return;
    case 'play-bill': if (HERO[BILL_I]) openDetail(HERO[BILL_I], true); return;
    case 'bill-list': {
      const c = HERO[BILL_I];
      if (!c) return;
      const was = inList(c.id);
      const l = getMyList();
      const next = was ? l.filter(function (x) { return x.id !== c.id; }) : l.concat([slimItem(c)]);
      saveList(next);
      refreshListButtons(c.id, !was);
      toast(was ? 'Removed from My List' : 'Added to My List');
      return;
    }
    case 'info-bill': if (HERO[BILL_I]) openDetail(HERO[BILL_I], false); return;
    case 'close-modal': closeModal(); return;
    case 'close-player': closePlayer(); return;
    case 'play-current': playCurrent(); return;
    case 'open-current': if (currentItem) { hidePreview(true); openDetail(currentItem, false); } return;
    case 'toggle-current': toggleCurrent(); return;
    case 'like': toast('Rated 👍 — more like this coming'); return;
    case 'share': {
      if (!currentItem) return;
      const url = location.href.split('#')[0] + '#title=' + encodeURIComponent(currentItem.id);
      const done = function () { toast('Link copied ✓'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { prompt('Copy link:', url); });
      } else {
        prompt('Copy link:', url);
      }
      return;
    }
  }
}

function setActiveNav(el) {
  const bar = el && el.closest ? el.closest('.links') : null;
  if (!bar) return;
  bar.querySelectorAll('span').forEach(function (s) { s.classList.remove('active'); });
  el.classList.add('active');
}

function enterProfile(id) {
  curPid = id;
  const p = profs().find(function (x) { return x.id === id; });
  $('myAv').textContent = ((p && p.name) || 'G').slice(0, 1).toUpperCase();
  $('gate').style.display = 'none';
  $('app').style.display = 'block';
  loadHome();
}
function enterGuest() {
  curPid = 'guest';
  $('myAv').textContent = 'G';
  $('gate').style.display = 'none';
  $('app').style.display = 'block';
  loadHome();
}
function openSettings() {
  $('settings').style.display = 'flex';
  $('keyInput').value = getKey();
  applyPrefs();
  $('keyStatus').textContent = getKey() ? '' : 'No key saved — using built-in + fallbacks.';
}
function closeSettings() { $('settings').style.display = 'none'; }

function openFromHash() {
  const m = (location.hash || '').match(/title=([^&]+)/);
  if (!m) return;
  const id = decodeURIComponent(m[1]);
  const c = DB[id];
  if (c) openById(id);
}

renderGate();
bindEvents();
applyPrefs();
$('browseGenre').addEventListener('change', function () { paintBrowse(); });
$('browseSort').addEventListener('change', function () { paintBrowse(); });
$('autoplayBill').addEventListener('change', function (e) {
  prefs.billAuto = !!e.target.checked;
  savePrefs();
  restartBillboard();
  restartBillProgress();
});
$('reduceMotion').addEventListener('change', function (e) {
  prefs.reduceMotion = !!e.target.checked;
  savePrefs();
  applyPrefs();
});
window.addEventListener('hashchange', openFromHash);
if ((location.hash || '').indexOf('title=') >= 0) {
  const tryHash = function (n) {
    if (DB[decodeURIComponent((location.hash.match(/title=([^&]+)/) || [])[1] || '')]) { openFromHash(); return; }
    if (n < 40) setTimeout(function () { tryHash(n + 1); }, 500);
  };
  setTimeout(function () { tryHash(0); }, 1500);
}
document.addEventListener('keydown', function (e) {
  const typing = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
  if ($('app').style.display === 'none') return;
  if ($('modal').style.display === 'flex' || $('player').style.display === 'flex') return;
  if (typing) return;
  if (e.key === 'ArrowRight') nextBillboard();
  if (e.key === 'ArrowLeft' && HERO.length) {
    BILL_I = (BILL_I - 1 + HERO.length) % HERO.length;
    billboardOn = false;
    paintBillboard();
    restartBillboard();
  }
});
