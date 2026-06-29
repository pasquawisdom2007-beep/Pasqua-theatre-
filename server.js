const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Movies API
app.get('/api/movies', (req, res) => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/movies.json'), 'utf8'));
  const q = req.query.q ? req.query.q.toLowerCase() : '';
  const genre = req.query.genre ? req.query.genre.toLowerCase() : '';
  const year = req.query.year || '';

  let results = data;
  if (q) results = results.filter(m => m.title.toLowerCase().includes(q) || m.genre.toLowerCase().includes(q));
  if (genre && genre !== 'all') results = results.filter(m => m.genre.toLowerCase() === genre);
  if (year && year !== 'all') results = results.filter(m => String(m.year) === year);

  res.json(results);
});

// Music API
app.get('/api/music', (req, res) => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/music.json'), 'utf8'));
  const q = req.query.q ? req.query.q.toLowerCase() : '';
  const genre = req.query.genre ? req.query.genre.toLowerCase() : '';

  let results = data;
  if (q) results = results.filter(m => m.title.toLowerCase().includes(q) || m.artist.toLowerCase().includes(q) || m.genre.toLowerCase().includes(q));
  if (genre && genre !== 'all') results = results.filter(m => m.genre.toLowerCase() === genre);

  res.json(results);
});

// Serve HTML pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/movies', (req, res) => res.sendFile(path.join(__dirname, 'public/movies.html')));
app.get('/music', (req, res) => res.sendFile(path.join(__dirname, 'public/music.html')));
app.get('/library', (req, res) => res.sendFile(path.join(__dirname, 'public/library.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public/about.html')));

app.listen(PORT, () => {
  console.log(`PASQUA THEATRE :: NODE ACTIVE :: PORT ${PORT}`);
});
