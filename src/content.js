(function () {
  document.addEventListener(
    'click',
    (e) => {
      if (!window.spawnPomBomb) return;
      window.spawnPomBomb(e.clientX, e.clientY, document.documentElement);
    },
    true
  );
})();
