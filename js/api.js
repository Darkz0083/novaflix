'use strict';
/* API layer: TMDB + Cinemeta + Jikan with timeouts, retries, caching. */
const CIN = 'https://v3-cinemeta.strem.io';
const TIMG = 'https://image.tmdb.org/t/p/w500';
const TIMGB = 'https://image.tmdb.org/t/p/w1280';
const TIMGO = 'https://image.tmdb.org/t/p/original';
const TODAY_ISO = '2026-09-07';

function getKey() {
  return (localStorage.getItem('novaflix-tmdb-key') || window.NOVAFLIX_TMDB_KEY || '').trim();
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

async function fetchJson(url, opts, timeoutMs, retries) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, timeoutMs || 12000);
  try {
    const r = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
    if (!r.ok) {
      if (r.status === 429 && (retries == null ? 2 : retries) > 0) {
        const ra = Number(r.headers && r.headers.get ? r.headers.get('retry-after') : 0);
        await sleep((isFinite(ra) && ra > 0 ? ra * 1000 : 1500));
        clearTimeout(t);
        return fetchJson(url, opts, timeoutMs, (retries == null ? 2 : retries) - 1);
      }
      throw new Error('http ' + r.status);
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function tmdb(path) {
  const k = getKey();
  if (!k) throw new Error('no tmdb key');
  const sep = path.includes('?') ? '&' : '?';
  return fetchJson('https://api.themoviedb.org/3' + path + sep + 'api_key=' + encodeURIComponent(k) + '&language=en-US');
}

async function tmdbSoft(path) {
  try { return await tmdb(path); } catch (e) { return null; }
}

const memCache = new Map();
async function cached(key, fn, ttlMs) {
  const now = Date.now();
  const hit = memCache.get(key);
  if (hit && now - hit.at < (ttlMs || 300000)) return hit.v;
  const v = await fn();
  memCache.set(key, { at: now, v: v });
  return v;
}

function cinCat(type, cat, genre) {
  const key = 'cin:' + type + ':' + cat + ':' + (genre || '');
  return cached(key, async function () {
    let u = CIN + '/catalog/' + type + '/' + cat;
    u += genre ? '/genre=' + encodeURIComponent(genre) + '.json' : '.json';
    try {
      const j = await fetchJson(u);
      return j.metas || [];
    } catch (e) { return []; }
  });
}

function cinMeta(type, id) {
  const key = 'meta:' + type + ':' + id;
  return cached(key, async function () {
    try {
      const j = await fetchJson(CIN + '/meta/' + type + '/' + id + '.json');
      return j.meta || null;
    } catch (e) { return null; }
  }, 600000);
}

/* Jikan is rate-limited: one shared queue, min gap between calls. */
let jikanAt = 0;
async function jikan(path) {
  const wait = Math.max(0, 1100 - (Date.now() - jikanAt));
  if (wait) await new Promise(function (r) { setTimeout(r, wait); });
  jikanAt = Date.now();
  return fetchJson('https://api.jikan.moe/v4' + path);
}

function jTop() {
  return cached('jikan:top', async function () {
    try {
      const j = await jikan('/top/anime?limit=18');
      return j.data || [];
    } catch (e) { return []; }
  });
}

function jSearch(q) {
  return cached('jikan:q:' + q, async function () {
    try {
      const j = await jikan('/anime?q=' + encodeURIComponent(q) + '&limit=8');
      return j.data || [];
    } catch (e) { return []; }
  }, 120000);
}

function bestLogo(logos) {
  if (!logos || !logos.length) return null;
  const s = logos.slice().sort(function (a, b) { return (b.vote_average || 0) - (a.vote_average || 0); });
  return s.find(function (l) { return l.iso_639_1 === 'en'; }) || s.find(function (l) { return !l.iso_639_1; }) || s[0];
}

function tmdbToItem(m, kind) {
  const isTV = kind === 'series' || !!m.first_air_date || m.media_type === 'tv';
  const title = m.title || m.name || 'Untitled';
  const rel = m.release_date || m.first_air_date || '2025-01-01';
  return {
    id: 'tmdb-' + (isTV ? 'tv' : 'mov') + '-' + m.id,
    kind: isTV ? 'series' : 'movie',
    tmdbId: m.id, tmdbKind: isTV ? 'tv' : 'movie', tt: null,
    title: title,
    poster: m.poster_path ? TIMG + m.poster_path : null,
    backdrop: m.backdrop_path ? TIMGB + m.backdrop_path : (m.poster_path ? TIMG + m.poster_path : null),
    logo: null, desc: m.overview || '', score: m.vote_average || 7.5,
    year: rel.slice(0, 4), genres: [], cast: [], director: [],
    trailerIds: [], trailerId: null,
    release: rel.slice(0, 10), upcoming: new Date(rel) > new Date(TODAY_ISO),
    maturity: m.adult ? 'TV-MA' : 'TV-14', dur: isTV ? '45m' : '2h 10m', raw: m
  };
}

function cinToItem(m) {
  const tids = (m.trailerStreams || []).map(function (t) { return t.ytId; })
    .concat((m.trailers || []).map(function (t) { return t.source; }))
    .filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  const yr = String(m.releaseInfo || m.year || '2025').slice(0, 4);
  return {
    id: m.type + ':' + m.id, kind: m.type === 'series' ? 'series' : 'movie',
    tmdbId: null, tmdbKind: null, tt: m.id, title: m.name,
    poster: m.poster, backdrop: m.background || m.poster, logo: m.logo || null,
    desc: m.description || '', score: m.imdbRating ? Number(m.imdbRating) : 7.5,
    year: yr, genres: m.genres || [], cast: m.cast || [], director: m.director || [],
    trailerIds: tids, trailerId: tids[0] || null,
    release: m.released ? m.released.slice(0, 10) : yr + '-01-01',
    upcoming: m.released ? new Date(m.released) > new Date(TODAY_ISO) : yr === '2026',
    maturity: 'TV-14', dur: m.runtime || '2h', raw: m
  };
}

function animeToItem(a, up) {
  const t = a.title_english || a.title;
  const img = a.images && a.images.jpg && a.images.jpg.large_image_url;
  const yid = (a.trailer && a.trailer.youtube_id) || null;
  return {
    id: 'anime:' + a.mal_id, kind: 'anime', tmdbId: null, tmdbKind: null, tt: null,
    title: t, poster: img, backdrop: img, logo: null, desc: a.synopsis || '',
    score: a.score || 8.4, year: String((a.aired && a.aired.prop && a.aired.prop.from && a.aired.prop.from.year) || 2025),
    genres: ((a.genres || []).map(function (g) { return g.name; })).slice(0, 3),
    cast: [], director: [],
    trailerIds: yid ? [yid] : [], trailerId: yid,
    release: (a.aired && a.aired.from) ? a.aired.from.slice(0, 10) : '2026-04-01',
    upcoming: !!up || a.status === 'Not yet aired',
    maturity: 'TV-14', dur: a.duration || '24m', raw: a
  };
}

function isKidSafeCard(c) {
  if (c.raw && c.raw.adult) return false;
  if (c.maturity === 'TV-MA') return false;
  const bad = ['Horror', 'Gore', 'Hentai', 'Ecchi', 'Erotica', 'Thriller'];
  if ((c.genres || []).some(function (g) { return bad.indexOf(g) >= 0; })) return false;
  if (c.raw && c.raw.genre_ids && c.raw.genre_ids.indexOf(27) >= 0) return false;
  return true;
}

function ytEmbed(id) { return 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1'; }
function ytThumb(id) { return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'; }
function ytWatch(t) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(t + ' official trailer'); }
