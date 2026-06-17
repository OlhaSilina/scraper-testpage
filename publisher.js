/*
 * Shared publisher logic for the ad-scraper test pages.
 *
 * Each method page sets `window.CLICK_METHOD` (e.g. 'anchor') and provides a
 * `<div id="ad-slot"></div>`, then includes this script. The script:
 *   - reads the counter URL from the ?target= query param,
 *   - embeds ad.html in a cross-origin sandbox iframe,
 *   - pushes the config (target + method) into the ad,
 *   - logs click activity to the DevTools console (nothing on the page).
 *
 * Contract for the scraper:
 *   <host>/<method>.html?target=<your-counter-url>
 */
(function () {
  var LOG_PREFIX = '[ad-test]';
  var method = window.CLICK_METHOD || 'window.open';

  function readTarget() {
    var p = new URLSearchParams(location.search);
    var t = p.get('target');
    return t ? t.trim() : '';
  }

  var target = readTarget();
  if (!target) {
    console.warn(LOG_PREFIX, 'no ?target= provided — clicks will do nothing. ' +
      'Append ?target=<your-counter-url> to the URL.');
  }

  // Build the cross-origin sandbox iframe. No allow-same-origin => opaque origin.
  var slot = document.getElementById('ad-slot');
  var frame = document.createElement('iframe');
  frame.src = 'ad.html';
  frame.title = 'Advertisement';
  frame.setAttribute('sandbox',
    'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation');
  slot.appendChild(frame);

  function sendConfig() {
    frame.contentWindow.postMessage({
      type: 'config',
      target: target,
      method: method,
      id: 'slot-1'
    }, '*');
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== frame.contentWindow) return;
    var d = ev.data || {};
    switch (d.type) {
      case 'loaded':
        sendConfig(); // push config as soon as the ad announces itself
        break;
      case 'ready':
        console.info(LOG_PREFIX, 'ad ready', { method: d.method, hasTarget: d.hasTarget });
        break;
      case 'click':
        if (d.ok) {
          console.info(LOG_PREFIX, 'CLICK fired', { method: d.method, nonce: d.nonce, url: d.url });
        } else {
          console.warn(LOG_PREFIX, 'CLICK ignored', { reason: d.reason });
        }
        break;
    }
  });
})();
