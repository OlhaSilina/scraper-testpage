# Guide: testing a scraper for click-request interception

## What this is and why

A set of static pages that mimic a publisher site with an ad. The ad is served
in a **cross-origin iframe**, and its target URL is **not hard-coded** — it is
assembled in JavaScript at click time ("JS-secure").

The goal is to verify that your scraper **intercepts the click request** and does
not let it reach the outside world. To check this, the target points at an
external "visit counter" (a canary):

- scraper **intercepted** the click → **nothing reaches** the counter ✅
- scraper **let the request through** → a hit appears on the counter ❌

Every click carries a unique `nonce`, so you can tell exactly which click leaked.

---

## Site address

Base URL (GitHub Pages):
```
https://olhasilina.github.io/scraper-testpage/
```
The home page is a menu linking to all variants.

---

## Page variants (by click-delivery method)

Each page does the same thing (ad in an iframe, target assembled after the click),
but **sends the request differently** afterwards. This matters: a scraper may
intercept some request types and miss others. So run all of them.

| Page | What it does after the click | Request type | When it matters |
|---|---|---|---|
| `window-open.html` | `window.open(url)` — opens in a new tab/popup | navigation (popup) | classic ad click that opens a landing page |
| `anchor.html` | programmatic click on a dynamic `<a href>` | navigation | the most common real-ad pattern |
| `location.html` | `location.href = url` | top-navigation | full-page redirect |
| `beacon.html` | `navigator.sendBeacon(url)` | beacon | background send (analytics/tracking) |
| `image.html` | `new Image().src = url` | image GET (pixel) | tracking pixel |
| `fetch.html` | `fetch(url, {mode:'no-cors'})` | fetch | programmatic background request |
| `ping.html` | `<a ping>` (hyperlink auditing) | ping (POST) | click/conversion tracking — on by default in Chrome/Safari, cannot be disabled by users |
| `xhr.html` | `XMLHttpRequest` GET | XHR | legacy AJAX; a separate API from fetch a scraper may forget to hook |
| `script.html` | dynamic `<script src>` | script GET | how real ad tags load (JSONP-style trackers) |
| `iframe.html` | hidden `<iframe src>` | document GET | impression pixels placed in nested frames |

**Link format for the scraper:**
```
https://olhasilina.github.io/scraper-testpage/<page>?target=<your-counter-URL>
```
Example:
```
https://olhasilina.github.io/scraper-testpage/anchor.html?target=https://webhook.site/3066d770-52e3-4220-b858-c489944bc252
```

> Without the `?target=` param, a click sends nothing (a warning is logged to the
> console). The counter URL is hard-coded nowhere — each tester passes their own.

---

## Visit counter (canary) — webhook.site

1. Open **https://webhook.site**
2. It immediately shows your unique URL: `https://webhook.site/<uuid>`
3. Copy it — that is your `target`.

On webhook.site every real request is visible live: time, IP, method, headers
(User-Agent), and query params `slot`, `cb`, `nonce`.

> A free webhook.site URL is deleted after ~7 days of inactivity — if it stops
> catching hits, open webhook.site again and grab a fresh URL.

---

## How to run the test — step by step

### Step 1. Manual baseline (confirm the canary is alive)

1. Open webhook.site, copy your URL.
2. In a browser open, e.g.:
   `https://olhasilina.github.io/scraper-testpage/anchor.html?target=<your-webhook>`
3. Open **DevTools → Console** (F12).
4. Click the ad banner.
5. Expected result:
   - the console shows `[ad-test] CLICK fired {method, nonce, url}`;
   - webhook.site shows a **new entry** with the same `nonce`.

If both appear, the canary works and the request really reaches the outside.
Now you can test the scraper.

### Step 2. Scraper run

> The scraper's console is **not** accessible, so verification is done entirely on
> webhook.site — you watch whether any new request arrives. Because of that, first
> make the "before" state unambiguous.

1. On webhook.site, clear existing requests (or note the current request count /
   the timestamp of the latest entry) so a new hit is obvious.
2. Hand the scraper the same link (`<page>?target=<your-webhook>`).
   Set its user-agent and proxy as usual if needed.
3. The scraper should open the page, **imitate the click**, and **intercept** the
   request (not let it out).

### Step 3. Check the result on webhook.site

This is the **only** check that matters here: did **any new** entry appear after the
scraper run?

| Result on webhook.site | Conclusion |
|---|---|
| no new entry | scraper intercepted the request correctly ✅ |
| a new entry appeared | scraper **let the request through** ❌ |

Notes:
- You cannot predict the `nonce` in advance (it is random per click), so you do not
  match it — you simply watch for any new hit. The `nonce`/`cb` still guarantee each
  request is unique, so webhook.site never deduplicates two leaks into one.
- Test one method per run and clear webhook.site between runs, so it is always clear
  which method produced a hit.

### Step 4. Repeat for every method

Run all 6 pages in turn (`window-open`, `anchor`, `location`, `beacon`, `image`,
`fetch`). The scraper is only reliable if it intercepts **all** request types. If
a hit appears on any method, there is a hole there.

---

## How to read the results (summary)

- Main criterion: **nothing new on webhook.site after the scraper's click = success**.
  A new entry = the request leaked out.
- **`nonce`** — a one-time unique click marker. During the manual baseline (your own
  browser) you can match the console `nonce` to the webhook.site entry. For the
  scraper run you cannot read its console, so you just watch for any new hit; the
  `nonce`/`cb` only ensure each request stays distinct (no deduplication).
- Clear webhook.site (or note the latest entry) before each scraper run so "new" is
  unambiguous, and test one method at a time.

---

## Out of scope / Phase 2: WebRTC IP leak

These pages only test **HTTP-layer** requests. WebRTC is a different layer: it sends
a UDP packet to a STUN server **directly from the network interface, bypassing the
proxy and the entire HTTP stack** — so it can leak the real IP even when every HTTP
request is intercepted. Request interception cannot stop it; it needs a browser-level
control (e.g. in a Chromium/QtWebEngine scraper:
`--force-webrtc-ip-handling-policy=disable_non_proxied_udp`, or removing
`RTCPeerConnection` via injected JS). A dedicated WebRTC probe page and the matching
verification are planned for **Phase 2** and are intentionally not part of this set.

## FAQ

**Nothing arrives even on a manual click.**
Check that the URL contains `?target=...` and that the webhook.site URL is current
(not expired). Look at the Console — it shows `no ?target= provided` if you forgot
the param.

**`window-open` opens a blank tab.**
That is fine — what matters is that the request went to webhook.site. You can close
the tab.

**The scraper's console is not accessible — does that matter?**
No. The console logs are only a convenience for the manual baseline in your own
browser. The actual scraper verification relies solely on webhook.site: a new entry
means the request leaked, no new entry means it was intercepted.
