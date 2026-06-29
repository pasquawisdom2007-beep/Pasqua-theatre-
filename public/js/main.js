// ── PASQUA THEATRE :: MAIN.JS ──

const BOOT_LINES = [
  '> INITIALIZING PASQUA THEATRE...',
  '> CONNECTING TO ENDPOINTS...',
  '> AUTHENTICATING NODE CLUSTER...',
  '> SYNCING MEDIA INDEX...',
  '> DECRYPTING STREAM MANIFEST...',
  '> CALIBRATING SIGNAL...',
  '> ACCESS GRANTED.'
];

// ── LOADER ──
function runLoader(onComplete) {
  const loader = document.getElementById('loader');
  if (!loader) { onComplete && onComplete(); return; }

  const container = loader.querySelector('.boot-lines');
  const bar = loader.querySelector('.progress-bar');
  container.innerHTML = '';

  BOOT_LINES.forEach((text, i) => {
    const line = document.createElement('div');
    line.className = 'boot-line';
    line.textContent = text;
    if (i < BOOT_LINES.length - 1) line.classList.add('ok');
    container.appendChild(line);
  });

  const lines = container.querySelectorAll('.boot-line');
  let i = 0;

  function showNext() {
    if (i >= lines.length) {
      if (bar) bar.style.width = '100%';
      setTimeout(() => {
        loader.style.transition = 'opacity 0.6s ease';
        loader.style.opacity = '0';
        setTimeout(() => {
          loader.style.display = 'none';
          onComplete && onComplete();
        }, 600);
      }, 600);
      return;
    }
    lines[i].style.opacity = '1';
    lines[i].style.transition = 'opacity 0.2s';
    if (bar) bar.style.width = ((i + 1) / lines.length * 100) + '%';
    i++;
    setTimeout(showNext, i === lines.length ? 200 : 280);
  }

  showNext();
}

// ── DOWNLOAD OVERLAY ──
const DL_LINES = [
  '> LOCATING MEDIA NODE...',
  '> VERIFYING STREAM TOKEN...',
  '> ESTABLISHING SECURE CHANNEL...',
  '> DECRYPTING FILE MANIFEST...',
  '> INITIATING TRANSFER...',
  '> DOWNLOAD READY.'
];

function runDownload(url, filename) {
  const overlay = document.getElementById('dl-overlay');
  if (!overlay) return;

  const container = overlay.querySelector('.dl-lines');
  const bar = overlay.querySelector('.dl-bar');
  container.innerHTML = '';

  DL_LINES.forEach(text => {
    const line = document.createElement('div');
    line.className = 'dl-line';
    line.textContent = text;
    container.appendChild(line);
  });

  overlay.classList.add('show');
  const lines = container.querySelectorAll('.dl-line');
  let i = 0;
  if (bar) bar.style.width = '0%';

  function showNext() {
    if (i >= lines.length) {
      if (bar) bar.style.width = '100%';
      setTimeout(() => {
        overlay.classList.remove('show');
        // Trigger actual download
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'download';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, 700);
      return;
    }
    lines[i].style.opacity = '1';
    lines[i].style.transition = 'opacity 0.2s';
    if (bar) bar.style.width = ((i + 1) / lines.length * 100) + '%';
    i++;
    setTimeout(showNext, 300);
  }

  showNext();
}

// ── PARTICLE CANVAS ──
function initParticles() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const particles = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    r: Math.random() * 1.5 + 0.3,
    alpha: Math.random() * 0.5 + 0.1
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,245,255,${p.alpha})`;
      ctx.fill();
    });

    // Connect nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0,245,255,${0.08 * (1 - dist / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ── NAV ACTIVE STATE ──
function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(a => {
    const href = a.getAttribute('href');
    const isActive = (path === '/' && href === '/') || (href !== '/' && path.startsWith(href));
    a.classList.toggle('active', isActive);
  });
}

// ── MOBILE NAV ──
function initMobileNav() {
  const burger = document.querySelector('.nav-burger');
  const menu = document.querySelector('.mobile-menu');
  if (!burger || !menu) return;
  burger.addEventListener('click', () => menu.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (!burger.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('open');
    }
  });
}

// ── LIBRARY HELPERS ──
function getLibrary() {
  try { return JSON.parse(localStorage.getItem('pq_library') || '{"movies":[],"music":[]}'); }
  catch { return { movies: [], music: [] }; }
}

function saveLibrary(lib) {
  localStorage.setItem('pq_library', JSON.stringify(lib));
}

function addToLibrary(type, item) {
  const lib = getLibrary();
  const arr = lib[type] || [];
  if (!arr.find(x => x.id === item.id)) {
    arr.push({ ...item, savedAt: new Date().toISOString() });
    lib[type] = arr;
    saveLibrary(lib);
  }
}

window.PT = { runDownload, addToLibrary, getLibrary };

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  setActiveNav();
  initMobileNav();

  runLoader(() => {
    document.querySelectorAll('.fade-in-after-load').forEach((el, i) => {
      el.style.opacity = '0';
      el.style.animation = `fadeIn 0.5s ease ${i * 0.1}s forwards`;
    });
  });

  // Attach download overlay clicks
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-download]');
    if (btn) {
      e.preventDefault();
      const url = btn.dataset.download;
      const name = btn.dataset.name || 'file';
      const type = btn.dataset.type || 'movie';
      const item = btn.dataset.item ? JSON.parse(btn.dataset.item) : null;
      if (item) addToLibrary(type, item);
      runDownload(url, name);
    }
  });
});
