# Ad Scraper Test Pages

Static pages for testing a web scraper whose job is to collect ads and to
**intercept the resulting click requests**, never letting them reach the
outside world.

Principle (canary): the ad lives in a **cross-origin iframe** and carries no
target URL in its markup — the URL is **assembled in JS at click time** and
points at an external counter service. If the scraper intercepts the click,
**no request reaches the counter**. If it leaks, you see a hit.

## Files

- `index.html` — landing/menu listing the per-method pages (no config UI).
- `window-open.html`, `anchor.html`, `location.html`, `beacon.html`,
  `image.html`, `fetch.html`, `ping.html`, `xhr.html`, `script.html`,
  `iframe.html` — one publisher page per click-delivery method.
- `publisher.js` — shared logic: reads `?target=`, embeds the ad, logs to console.
- `ad.html` — shared JS-secure creative: the target URL is stored obfuscated
  (base64) and decoded/assembled only at click time.
- `style.css` — shared styles.
- `server.js` + `.claude/launch.json` — local static server (for local testing only).

## Configuration — everything is in the URL

No on-page settings. The scraper is handed a link; the link carries the config:

```
<host>/<method>.html?target=<your-counter-url>
```

- **method** is chosen by which page you open (`anchor.html`, `beacon.html`, …).
- **target** is your own counter URL, passed as `?target=`.

Example: `https://your-host.netlify.app/anchor.html?target=https://webhook.site/<uuid>`

Without `?target=`, clicks do nothing (a warning is logged to the console).
Each tester uses their own counter URL — nothing is hard-coded.

### Click-delivery methods

Each method produces a different type of network request — a scraper may
intercept some and miss others, so test several:

| Page                | What it does                           | Request type     |
|---------------------|----------------------------------------|------------------|
| `window-open.html`  | `window.open(url)` — new tab/popup     | navigation       |
| `anchor.html`       | programmatic click on `<a href>`       | navigation       |
| `location.html`     | `location.href = url`                  | top-navigation   |
| `beacon.html`       | `navigator.sendBeacon(url)`            | beacon           |
| `image.html`        | `new Image().src = url`                | image GET        |
| `fetch.html`        | `fetch(url, {mode:'no-cors'})`         | fetch            |
| `ping.html`         | `<a ping>` hyperlink auditing          | ping (POST)      |
| `xhr.html`          | `XMLHttpRequest` GET                    | XHR              |
| `script.html`       | dynamic `<script src>`                 | script GET       |
| `iframe.html`       | hidden `<iframe src>`                  | document GET     |

> WebRTC IP leak is a separate network layer (UDP/STUN, bypasses the proxy) that
> HTTP interception cannot stop — out of scope here, planned for Phase 2.

## Counter service (ready-made, no backend)

You need an external URL that records visits. Recommended:

- **webhook.site** *(recommended)* — open https://webhook.site, copy your unique
  URL `https://webhook.site/<uuid>`. Every real request shows up live: time, IP,
  method, headers (User-Agent), query params (`slot`, `cb`, `nonce`).
- **Canarytokens** — https://canarytokens.org, a URL token that emails an alert on visit.
- **Bitly / Short.io** — numeric click counters (no per-request detail).

> Google URL Shortener (goo.gl) is **dead** — discontinued (no new links since
> 2019, existing links stopped working in 2025). Do not use it.
> Note: free webhook.site URLs are deleted after ~7 days of inactivity.

## Setup / hosting (external scraper → public URL)

These are plain static files, so hosting is free and backend-free.

**Recommended — Netlify Drop:**
1. Go to https://app.netlify.com/drop and **drag the `ad_scraper_testpage`
   folder** into the window. You get a URL like `https://<random>.netlify.app/`.
2. Pages are reachable as `https://<random>.netlify.app/<method>.html?target=<counter>`.
3. Alternatives: **GitHub Pages** (push the repo, enable Pages) or **Vercel**
   (import the folder/repo) — all serve the files as-is, nothing is built.

`server.js` + `.claude/launch.json` are only for **local** testing:

```powershell
node server.js 8000
# open http://localhost:8000/anchor.html?target=https://webhook.site/<uuid>
```

(Cross-origin works on a host too — the sandbox gives the iframe an opaque
origin. For extra realism you may host `ad.html` on a separate origin and point
the iframe `src` in `publisher.js` at that full URL, but it is not required.)

## Verification procedure

1. Open webhook.site, copy your unique URL.
2. Open `<host>/anchor.html?target=<webhook-url>` and open DevTools console.
3. **Baseline (manual):** click the ad banner → the console shows
   `[ad-test] CLICK fired` with a `nonce`, and webhook.site shows a hit with the
   same `nonce`. Confirms the canary works.
4. **Scraper run:** point your scraper at the same link. It imitates a click and
   should intercept + block the request.
5. **Result on webhook.site:**
   - no new hit → scraper intercepted the request correctly ✅
   - a new hit appeared → scraper leaked the request to the outside world ❌
     (the `nonce` tells you which click leaked)
6. Repeat for each method page.

> The console log records the `nonce` **before** the request is sent — so even
> if the scraper blocks the navigation, you know which click was expected and
> can match it against the counter.
