(() => {
  try {
    var svg = '' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">' +
        '<defs>' +
          '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#e5e7eb" />' +
            '<stop offset="1" stop-color="#d1d5db" />' +
          '</linearGradient>' +
        '</defs>' +
        '<rect width="800" height="400" fill="url(#g)"/>' +
        '<g fill="#9ca3af">' +
          '<circle cx="400" cy="190" r="36"/>' +
          '<rect x="340" y="238" width="120" height="14" rx="7"/>' +
        '</g>' +
      '</svg>';

    var CARD_PLACEHOLDER_2x1 = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);

    function applyFallback(img) {
      if (!img || img.dataset.fallbackApplied === '1') return;
      img.dataset.fallbackApplied = '1';
      try { img.setAttribute('data-original-src', img.getAttribute('src') || ''); } catch {}
      try { img.removeAttribute('srcset'); } catch {}
      try { img.src = CARD_PLACEHOLDER_2x1; } catch {}
    }

    // Global capture-phase error handler for all images
    document.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG') {
        applyFallback(t);
      }
    }, true);

    // Observe DOM additions to attach error handlers to dynamically inserted images
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (!n) continue;
          if (n.tagName === 'IMG') {
            n.addEventListener('error', function () { applyFallback(this); }, { once: true });
          } else if (n.querySelectorAll) {
            var imgs = n.querySelectorAll('img');
            for (var k = 0; k < imgs.length; k++) {
              imgs[k].addEventListener('error', function () { applyFallback(this); }, { once: true });
            }
          }
        }
      }
    });

    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch { /* noop */ }
})();
