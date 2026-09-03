// Pomium pom-bomb effect: spawns an animated Pomeranian "bomb" at a screen
// coordinate. Self-contained (no deps) so it can be dropped into either the
// Electron renderer or the browser-extension content script unchanged.
(function (global) {
  const POM_SVG = `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <circle cx="60" cy="65" r="48" fill="#f3c88a"/>
  <circle cx="26" cy="50" r="20" fill="#f3c88a"/>
  <circle cx="94" cy="50" r="20" fill="#f3c88a"/>
  <circle cx="30" cy="28" r="14" fill="#e0a95e"/>
  <circle cx="90" cy="28" r="14" fill="#e0a95e"/>
  <circle cx="60" cy="55" r="34" fill="#fbe4b8"/>
  <circle cx="30" cy="65" r="16" fill="#fff6e6"/>
  <circle cx="90" cy="65" r="16" fill="#fff6e6"/>
  <ellipse cx="60" cy="66" rx="16" ry="12" fill="#fffaf0"/>
  <circle cx="46" cy="50" r="4.5" fill="#2b1c12"/>
  <circle cx="74" cy="50" r="4.5" fill="#2b1c12"/>
  <circle cx="47.5" cy="48.5" r="1.3" fill="#fff"/>
  <circle cx="75.5" cy="48.5" r="1.3" fill="#fff"/>
  <ellipse cx="60" cy="60" rx="4.5" ry="3.5" fill="#2b1c12"/>
  <path d="M60 63 Q60 70 52 71" stroke="#2b1c12" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M60 63 Q60 70 68 71" stroke="#2b1c12" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M58 71 Q60 78 62 71 Q60 74 58 71" fill="#f27a94"/>
</svg>`.trim();

  const PAW_SVG = `
<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="20" cy="26" rx="9" ry="7" fill="#c98a4b"/>
  <circle cx="10" cy="14" r="4.5" fill="#c98a4b"/>
  <circle cx="19" cy="9" r="4.5" fill="#c98a4b"/>
  <circle cx="28" cy="14" r="4.5" fill="#c98a4b"/>
</svg>`.trim();

  function spawnPomBomb(x, y, root) {
    root = root || document.body || document.documentElement;

    const wrap = document.createElement('div');
    wrap.className = 'pom-bomb-fx';
    wrap.style.left = x + 'px';
    wrap.style.top = y + 'px';

    const shock = document.createElement('div');
    shock.className = 'pom-bomb-shock';
    wrap.appendChild(shock);

    const pawCount = 6;
    for (let i = 0; i < pawCount; i++) {
      const paw = document.createElement('div');
      paw.className = 'pom-bomb-paw';
      const angle = (360 / pawCount) * i + (Math.random() * 20 - 10);
      const dist = 55 + Math.random() * 25;
      const rad = (angle * Math.PI) / 180;
      paw.style.setProperty('--tx', (Math.cos(rad) * dist).toFixed(1) + 'px');
      paw.style.setProperty('--ty', (Math.sin(rad) * dist).toFixed(1) + 'px');
      paw.style.setProperty('--rot', (Math.random() * 360).toFixed(0) + 'deg');
      paw.innerHTML = PAW_SVG;
      wrap.appendChild(paw);
    }

    const dog = document.createElement('div');
    dog.className = 'pom-bomb-dog';
    dog.innerHTML = POM_SVG;
    wrap.appendChild(dog);

    root.appendChild(wrap);
    const cleanup = () => wrap.remove();
    dog.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, 1600);
  }

  global.spawnPomBomb = spawnPomBomb;
})(typeof window !== 'undefined' ? window : globalThis);
