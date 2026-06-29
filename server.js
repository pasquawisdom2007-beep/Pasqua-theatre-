'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ── helpers ─────────────────────────────────────────────────────────────────

function fetchJSON(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const reqOptions = {
      hostname: opts.hostname,
      path:     opts.pathname + opts.search,
      method:   'GET',
      headers:  {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept':     'application/json',
        ...extraHeaders,
      },
      timeout: 20000,
    };
    const req = https.request(reqOptions, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// ── LOCAL data APIs ──────────────────────────────────────────────────────────

app.get('/api/movies', (req, res) => {
  const data  = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/movies.json'), 'utf8'));
  const q     = req.query.q     ? req.query.q.toLowerCase()     : '';
  const genre = req.query.genre ? req.query.genre.toLowerCase() : '';
  const year  = req.query.year  || '';

  let results = data;
  if (q)                          results = results.filter(m => m.title.toLowerCase().includes(q) || m.genre.toLowerCase().includes(q));
  if (genre && genre !== 'all')   results = results.filter(m => m.genre.toLowerCase() === genre);
  if (year  && year  !== 'all')   results = results.filter(m => String(m.year) === year);
  res.json(results);
});

app.get('/api/music', (req, res) => {
  const data  = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/music.json'), 'utf8'));
  const q     = req.query.q     ? req.query.q.toLowerCase()     : '';
  const genre = req.query.genre ? req.query.genre.toLowerCase() : '';

  let results = data;
  if (q)                        results = results.filter(m => m.title.toLowerCase().includes(q) || m.artist.toLowerCase().includes(q) || m.genre.toLowerCase().includes(q));
  if (genre && genre !== 'all') results = results.filter(m => m.genre.toLowerCase() === genre);
  res.json(results);
});

// ── PROXY: prexzy movie search ───────────────────────────────────────────────
// Bypasses CORS; client calls /api/proxy/moviesearch?query=...
app.get('/api/proxy/moviesearch', async (req, res) => {
  const query = (req.query.query || req.query.q || '').trim();
  if (!query) return res.json({ status: false, results: [], total_results: 0 });

  try {
    const data = await fetchJSON(
      'https://docs.prexzyapis.com/moviesearch?query=' + encodeURIComponent(query)
    );
    res.json(data);
  } catch (err) {
    res.status(502).json({ status: false, error: err.message, results: [], total_results: 0 });
  }
});

// ── PROXY: prexzy home / trending ───────────────────────────────────────────
app.get('/api/proxy/home', async (req, res) => {
  // Strategy: try /home first; if it returns empty, populate with popular searches
  try {
    const data = await fetchJSON('https://docs.prexzyapis.com/home');

    const movies   = data.movies   || data.trending_movies || data.films   || [];
    const episodes = data.episodes || data.trending_episodes || data.series || [];

    // If home feed is empty, hydrate from popular search terms
    if (!movies.length && !episodes.length) {
      const POPULAR = ['avengers', 'spiderman', 'black panther', 'batman'];
      const allResults = [];
      for (const term of POPULAR) {
        try {
          const r = await fetchJSON('https://docs.prexzyapis.com/moviesearch?query=' + encodeURIComponent(term));
          const hits = r.results || r.data || r.movies || [];
          allResults.push(...hits.slice(0, 3));
        } catch (_) {}
      }
      return res.json({ movies: allResults.slice(0, 12), episodes: [] });
    }

    res.json({ movies, episodes });
  } catch (err) {
    // Complete fallback — hydrate from search
    try {
      const POPULAR = ['avengers', 'spiderman', 'inception', 'batman'];
      const allResults = [];
      for (const term of POPULAR) {
        try {
          const r = await fetchJSON('https://docs.prexzyapis.com/moviesearch?query=' + encodeURIComponent(term));
          const hits = r.results || r.data || r.movies || [];
          allResults.push(...hits.slice(0, 3));
        } catch (_) {}
      }
      res.json({ movies: allResults.slice(0, 12), episodes: [] });
    } catch (e2) {
      res.status(502).json({ movies: [], episodes: [], error: err.message });
    }
  }
});

// ── PROXY: music search + download chain ─────────────────────────────────────
// Mirrors the play.js strategy order — all API calls happen server-side
const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = 'yt-search-and-download-mp3.p.rapidapi.com';

async function ytSearch(query) {
  const data = await fetchJSON(
    'https://api.siputzx.my.id/api/s/ytsearch?query=' + encodeURIComponent(query)
  );
  return data?.data?.[0] || null;
}

const MUSIC_STRATEGIES = [
  // 1 — RapidAPI (only if key configured)
  async (query) => {
    if (!RAPIDAPI_KEY) throw new Error('no rapidapi key');
    const v = await ytSearch(query);
    if (!v?.title) throw new Error('no video');
    const d = await fetchJSON(
      'https://' + RAPIDAPI_HOST + '/mp3?q=' + encodeURIComponent(v.title),
      { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST }
    );
    if (!d?.success || !d?.download) throw new Error('no url');
    return { url: d.download, title: v.title, artist: v.author?.name || v.channel || '', duration: v.duration || '', thumbnail: v.thumbnail || '' };
  },

  // 2 — Prexzyvilla Apple Music → Spotify
  async (query) => {
    const s = await fetchJSON('https://apis.prexzyvilla.site/search/applemusic?q=' + encodeURIComponent(query));
    const track = (s?.data || [])[0];
    if (!track?.link) throw new Error('no track');
    const artistClean = (track.artist || '').replace(/^[^·]*·\s*/, '');
    const d = await fetchJSON('https://apis.prexzyvilla.site/download/spotify?url=' + encodeURIComponent(track.link));
    const url = d?.download_url ?? d?.url ?? d?.audio ?? d?.link ?? d?.result?.url ?? d?.data?.url;
    if (!url) throw new Error('no url');
    return { url, title: d?.title || d?.name || track.title || query, artist: d?.artist || artistClean, duration: d?.duration || '', thumbnail: d?.thumbnail || d?.image || track.image || '' };
  },

  // 3 — Prexzyvilla Spotify raw query
  async (query) => {
    const d = await fetchJSON('https://apis.prexzyvilla.site/download/spotify?url=' + encodeURIComponent(query));
    const url = d?.download_url ?? d?.url ?? d?.audio ?? d?.link ?? d?.result?.url ?? d?.data?.url;
    if (!url) throw new Error('no url');
    return { url, title: d?.title || d?.name || query, artist: d?.artist || '', duration: d?.duration || '', thumbnail: d?.thumbnail || d?.image || '' };
  },

  // 4 — Prexzyvilla ytdl via siputzx
  async (query) => {
    const v = await ytSearch(query);
    if (!v?.url) throw new Error('no video');
    const d = await fetchJSON('https://apis.prexzyvilla.site/download/ytdl?url=' + encodeURIComponent(v.url));
    let url = null;
    if (Array.isArray(d?.formats)) {
      const picks = [
        d.formats.find(f => f.type === 'audio' && f.format === 'mp3'),
        d.formats.find(f => f.type === 'audio' && f.format === 'm4a'),
        d.formats.find(f => f.type === 'audio'),
      ];
      for (const f of picks) { if (f?.url) { url = f.url; break; } }
    }
    url = url ?? d?.result?.download_url ?? d?.result?.url ?? d?.download_url ?? d?.url ?? d?.data?.url ?? d?.data?.download;
    if (!url) throw new Error('no url');
    return { url, title: v.title || query, artist: v.author?.name || v.channel || '', duration: v.duration || '', thumbnail: v.thumbnail || '' };
  },

  // 5 — siputzx search → ytmp3
  async (query) => {
    const v = await ytSearch(query);
    if (!v?.url) throw new Error('no video');
    const d = await fetchJSON('https://api.siputzx.my.id/api/d/ytmp3?url=' + encodeURIComponent(v.url));
    const url = d?.data?.url || d?.url;
    if (!url) throw new Error('no url');
    return { url, title: v.title || query, artist: v.author?.name || v.channel || '', duration: v.duration || '', thumbnail: v.thumbnail || '' };
  },

  // 6 — giftedtech
  async (query) => {
    const d = await fetchJSON('https://apis.davidcyril.name.ng/play?query=$' + encodeURIComponent('ytsearch:' + query));
    const url = d?.result?.download_url || d?.data?.url;
    if (!url) throw new Error('no url');
    return { url, title: d?.result?.title || query, artist: d?.result?.artist || d?.result?.channel || '', duration: d?.result?.duration || '', thumbnail: d?.result?.thumbnail || '' };
  },

  // 7 — paxsenix
  async (query) => {
    const d = await fetchJSON('https://api.paxsenix.biz.id/yt/mp3?url=' + encodeURIComponent('ytsearch:' + query));
    const url = d?.url || d?.data?.url;
    if (!url) throw new Error('no url');
    return { url, title: d?.title || query, artist: d?.artist || d?.channel || '', duration: d?.duration || '', thumbnail: d?.thumbnail || '' };
  },

  // 8 — ryzendesu search → ytmp3
  async (query) => {
    const s = await fetchJSON('https://api.ryzendesu.vip/api/search/youtube?query=' + encodeURIComponent(query));
    const v = s?.result?.[0] || s?.[0];
    if (!v?.url) throw new Error('no video');
    const d = await fetchJSON('https://api.ryzendesu.vip/api/downloader/ytmp3?url=' + encodeURIComponent(v.url));
    const url = d?.url || d?.data?.url;
    if (!url) throw new Error('no url');
    return { url, title: v.title || query, artist: v.author?.name || v.channel || '', duration: v.duration || '', thumbnail: v.thumbnail || '' };
  },

  // 9 — tiklydown
  async (query) => {
    const d = await fetchJSON('https://api.tiklydown.eu.org/api/download/yt/mp3?url=ytsearch:' + encodeURIComponent(query));
    const url = d?.result?.download || d?.url;
    if (!url) throw new Error('no url');
    return { url, title: d?.result?.title || query, artist: d?.result?.artist || d?.result?.channel || '', duration: d?.result?.duration || '', thumbnail: d?.result?.thumbnail || '' };
  },
];

app.get('/api/proxy/musicsearch', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'missing query' });

  for (const strategy of MUSIC_STRATEGIES) {
    try {
      const result = await strategy(query);
      if (result?.url?.startsWith('http')) {
        return res.json({ status: true, ...result });
      }
    } catch (_) { /* try next */ }
  }

  res.status(502).json({ status: false, error: 'all strategies exhausted' });
});

// ── Page routes ──────────────────────────────────────────────────────────────
app.get('/',        (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/movies',  (req, res) => res.sendFile(path.join(__dirname, 'public/movies.html')));
app.get('/music',   (req, res) => res.sendFile(path.join(__dirname, 'public/music.html')));
app.get('/library', (req, res) => res.sendFile(path.join(__dirname, 'public/library.html')));
app.get('/about',   (req, res) => res.sendFile(path.join(__dirname, 'public/about.html')));

app.listen(PORT, () => {
  console.log(`PASQUA THEATRE :: NODE ACTIVE :: PORT ${PORT}`);
});
