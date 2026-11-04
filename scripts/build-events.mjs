// Generates static, shareable event pages for eaves.be from the public Supabase data.
//
// Output (inside OUT_DIR):
//   event/<uuid>/index.html   one page per upcoming public event
//   events/index.html         overview grouped by night
//   index.html                the marker <!--EVENTS--> is replaced by an events strip
//   sitemap.xml, robots.txt
//
// The script only uses the public anon key and one database function,
// get_public_event_feed(), which returns exactly the fields shown on the pages.
// The anon role has no access to the underlying tables. A fetch error aborts
// the build, so the previous deployment stays online instead of being replaced
// by an empty site.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ── Configuration ─────────────────────────────────────────────────────────────

const SITE_ORIGIN = 'https://eaves.be';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://pxrgheclywxmpbnclngh.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OUT_DIR = path.resolve(process.env.OUT_DIR ?? '_site');
const EVENTS_FIXTURE = process.env.EVENTS_FIXTURE; // local testing only

const TIME_ZONE = 'Europe/Brussels';
// Same "night day" rule as the app: a night belongs to the day it started on
// until 07:00 the next morning.
const NIGHT_CUTOFF_HOUR = 7;

const APP_STORE_ID = '6794866218';
const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.eaves.app';
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/assets/scene-banner.png`;

// Placeholder in index.html that is replaced by the events strip at build time.
const HOME_MARKER = '<!--EVENTS-->';
// The strip is hidden below this number of upcoming events.
const HOME_STRIP_MIN = 3;
const HOME_STRIP_MAX = 5;

// Version queries for the shared assets; raise them when site.css or site.js change.
const CSS_VERSION = '8';
const JS_VERSION = '9';

// Static pages that are listed in the sitemap next to the event pages.
const STATIC_PAGES = [
  '/',
  '/events/',
  '/for-hosts/',
  '/for-artists/',
  '/for-venues/',
  '/privacy.html',
  '/terms.html',
];

// Only covers hosted by us are used as visible cover and og:image. Covers
// hotlinked from third-party sites are ignored.
const TRUSTED_IMAGE_HOSTS = new Set([new URL(SUPABASE_URL).host]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Small helpers ─────────────────────────────────────────────────────────────

function fail(message) {
  console.error(`build-events: ${message}`);
  process.exit(1);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON inside a <script> tag must never be able to close that tag.
function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function truncate(text, max) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function trustedImage(value) {
  const url = httpsUrl(value);
  return url && TRUSTED_IMAGE_HOSTS.has(new URL(url).host) ? url : null;
}

// ── Time handling (Europe/Brussels) ───────────────────────────────────────────

const partsFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const dayShortFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function localParts(date) {
  const parts = Object.fromEntries(partsFormat.formatToParts(date).map((p) => [p.type, p.value]));
  return { y: +parts.year, m: +parts.month, d: +parts.day, h: +parts.hour, min: +parts.minute };
}

// UTC instant at which the Brussels wall clock shows y-m-d h:00.
function localHourToInstant(y, m, d, h) {
  const guess = Date.UTC(y, m - 1, d, h);
  const p = localParts(new Date(guess));
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - guess;
  return new Date(guess - offset);
}

// Start of the current night day: the most recent 07:00 Brussels time.
function currentNightStart(now = new Date()) {
  const p = localParts(now);
  let day = Date.UTC(p.y, p.m - 1, p.d);
  if (p.h < NIGHT_CUTOFF_HOUR) day -= 86_400_000;
  const b = new Date(day);
  return localHourToInstant(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate(), NIGHT_CUTOFF_HOUR);
}

// YYYY-MM-DD of the night day a moment belongs to.
function nightKey(date) {
  const p = localParts(date);
  let day = Date.UTC(p.y, p.m - 1, p.d);
  if (p.h < NIGHT_CUTOFF_HOUR) day -= 86_400_000;
  return new Date(day).toISOString().slice(0, 10);
}

function formatNightLabel(key) {
  return dayFormat.format(new Date(`${key}T12:00:00Z`));
}

function formatTimeRange(start, end) {
  if (!end) return `From ${timeFormat.format(start)}`;
  if (nightKey(end) === nightKey(start)) {
    return `${timeFormat.format(start)} until ${timeFormat.format(end)}`;
  }
  return `${timeFormat.format(start)} until ${dayShortFormat.format(end)} ${timeFormat.format(end)}`;
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadFromSupabase() {
  if (!SUPABASE_ANON_KEY) fail('SUPABASE_ANON_KEY is not set');

  const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  // Legacy anon keys are JWTs and may double as bearer token; newer
  // sb_publishable_ keys are not JWTs and must only be sent as apikey.
  if (SUPABASE_ANON_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_event_feed`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  if (!response.ok) {
    fail(`get_public_event_feed failed: ${response.status} ${await response.text()}`);
  }

  const events = await response.json();
  if (!Array.isArray(events)) fail('get_public_event_feed did not return an array');
  return { events };
}

async function loadFromFixture(file) {
  const fixture = JSON.parse(await readFile(file, 'utf8'));
  return { events: fixture.events ?? [] };
}

// ── Normalisation ─────────────────────────────────────────────────────────────

function formatPrice(price) {
  if (price === null) return null;
  if (price === 0) return 'Free';
  return `€${price.toFixed(2).replace(/\.00$/, '')}`;
}

function normalizeEvent(raw) {
  if (!UUID_RE.test(raw.id ?? '') || !raw.title) return null;

  const start = new Date(raw.start_datetime);
  if (Number.isNaN(start.getTime())) return null;
  const end = raw.end_datetime ? new Date(raw.end_datetime) : null;

  const location = raw.location ?? raw.venue?.location ?? null;
  const placeName = raw.venue?.name ?? raw.location?.name ?? null;
  const address = location
    ? [location.address_line_1, [location.postal_code, location.city].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
    : '';

  // Structured address parts for schema.org PostalAddress.
  const addressParts = location
    ? { street: location.address_line_1 ?? null, postalCode: location.postal_code ?? null, city: location.city ?? null }
    : null;

  const hasCoords = typeof location?.latitude === 'number' && typeof location?.longitude === 'number';
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`
    : address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${placeName ?? ''} ${address}`.trim())}`
      : null;

  const seen = new Set();
  const lineup = (raw.lineup ?? [])
    .map((l) => ({
      name: l.name ? String(l.name).trim() : null,
      start: l.start_time ? new Date(l.start_time) : null,
    }))
    .filter((l) => {
      if (!l.name || seen.has(l.name.toLowerCase())) return false;
      seen.add(l.name.toLowerCase());
      return true;
    })
    .sort((a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity));

  const price = raw.price === null || raw.price === undefined ? null : Number(raw.price);

  return {
    id: raw.id,
    title: String(raw.title).trim(),
    description: String(raw.description ?? '').trim(),
    start,
    end,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : null,
    nightKey: nightKey(start),
    placeName,
    address,
    addressParts,
    mapsUrl,
    latitude: hasCoords ? location.latitude : null,
    longitude: hasCoords ? location.longitude : null,
    lineup,
    price: Number.isFinite(price) ? price : null,
    ticketUrl: httpsUrl(raw.ticket_url),
    minAge: Number.isInteger(raw.min_age) && raw.min_age > 0 ? raw.min_age : null,
    genres: (raw.genres ?? []).filter(Boolean).slice(0, 6),
    organizer: raw.organizer_display_name ? String(raw.organizer_display_name).trim() : null,
    cover: trustedImage(raw.cover_image_url),
    // Set by get_public_event_feed(); older feed versions simply omit it.
    isStudent: raw.is_student === true,
  };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">';

function storeBadges() {
  return `<div class="row badges">
  <a href="${APP_STORE_URL}"><img src="/assets/store-badge-apple.svg" alt="Download on the App Store" height="46"></a>
  <a href="${PLAY_URL}"><img src="/assets/store-badge-google.svg" alt="Get it on Google Play" height="46"></a>
</div>`;
}

function layout({ title, description, canonical, image, extraHead = '', body, script = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#121212">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:site_name" content="Eaves">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/assets/icon.png">
<link rel="apple-touch-icon" href="/assets/icon.png">
${FONTS}
<link rel="stylesheet" href="/assets/site.css?v=${CSS_VERSION}">
${extraHead}
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="/"><img src="/assets/icon.png" alt="" width="34" height="34">Eaves</a>
  <nav class="nav" aria-label="Main"><a href="/events/">Events</a></nav>
  <a class="btn sm" href="/app?from=events">Download</a>
</div></header>
${body}
<footer class="foot"><div class="wrap">
  <nav aria-label="Footer"><a href="/privacy.html">Privacy policy</a><a href="/terms.html">Terms of service</a><a href="/events/">Upcoming events</a><a href="/for-hosts/">For hosts</a><a href="/for-artists/">For artists</a><a href="/for-venues/">For venues</a><a href="/delete-account.html">Delete account</a><a href="https://instagram.com/eaves.app">Instagram</a></nav>
  <a href="mailto:help@eaves.be">help@eaves.be</a>
</div></footer>
${script}
</body>
</html>
`;
}

function paragraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function renderEventPage(ev) {
  const canonical = `${SITE_ORIGIN}/event/${ev.id}/`;
  const priceLabel = formatPrice(ev.price);
  const metaDescription = truncate(
    ev.description ||
      `${ev.title} on ${formatNightLabel(ev.nightKey)}${ev.placeName ? ` at ${ev.placeName}` : ''}. See who is going on Eaves.`,
    155,
  );

  const facts = [
    ['When', `${esc(formatNightLabel(ev.nightKey))}<br>${esc(formatTimeRange(ev.start, ev.end))}`],
    ev.placeName || ev.address
      ? [
          'Where',
          `${ev.placeName ? esc(ev.placeName) : ''}${ev.placeName && ev.address ? '<br>' : ''}${esc(ev.address)}` +
            (ev.mapsUrl ? `<br><a href="${esc(ev.mapsUrl)}" rel="noopener">Open in Maps</a>` : ''),
        ]
      : null,
    priceLabel ? ['Price', esc(priceLabel)] : null,
    ev.minAge ? ['Age', `${ev.minAge}+`] : null,
    ev.organizer ? ['Host', esc(ev.organizer)] : null,
  ].filter(Boolean);

  const lineupHtml = ev.lineup.length
    ? `<section class="block"><h2>Lineup</h2><ul class="lineup">${ev.lineup
        .map(
          (l) =>
            `<li><span>${esc(l.name)}</span>${l.start ? `<time>${esc(timeFormat.format(l.start))}</time>` : ''}</li>`,
        )
        .join('')}</ul></section>`
    : '';

  const p = ev.addressParts;
  const postalAddress = p
    ? {
        '@type': 'PostalAddress',
        ...(p.street ? { streetAddress: p.street } : {}),
        ...(p.postalCode ? { postalCode: p.postalCode } : {}),
        ...(p.city ? { addressLocality: p.city } : {}),
        addressCountry: 'BE',
      }
    : null;

  const structured = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.title,
    startDate: ev.start.toISOString(),
    ...(ev.end ? { endDate: ev.end.toISOString() } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: canonical,
    image: [ev.cover ?? DEFAULT_OG_IMAGE],
    ...(ev.description ? { description: truncate(ev.description, 500) } : {}),
    ...(ev.placeName || postalAddress
      ? {
          location: {
            '@type': 'Place',
            ...(ev.placeName ? { name: ev.placeName } : {}),
            ...(postalAddress ? { address: postalAddress } : {}),
            ...(ev.latitude !== null
              ? { geo: { '@type': 'GeoCoordinates', latitude: ev.latitude, longitude: ev.longitude } }
              : {}),
          },
        }
      : {}),
    ...(ev.organizer ? { organizer: { '@type': 'Organization', name: ev.organizer } } : {}),
    ...(ev.lineup.length ? { performer: ev.lineup.map((l) => ({ '@type': 'PerformingGroup', name: l.name })) } : {}),
    ...(ev.price !== null
      ? {
          offers: {
            '@type': 'Offer',
            price: ev.price.toFixed(2),
            priceCurrency: 'EUR',
            url: ev.ticketUrl ?? canonical,
            // Only claim availability when there is a ticket link to back it up.
            ...(ev.ticketUrl ? { availability: 'https://schema.org/InStock' } : {}),
          },
        }
      : {}),
  };

  const body = `<main class="evp">
${ev.cover ? `<img class="cover" src="${esc(ev.cover)}" alt="" width="1280" height="720">` : ''}
<h1>${esc(ev.title)}</h1>
<div class="row">
  <a class="btn" id="openApp" href="${esc(`eaves://event/${ev.id}`)}" data-event-id="${ev.id}">Open in Eaves</a>
  ${ev.ticketUrl ? `<a class="btn secondary" href="${esc(ev.ticketUrl)}" rel="noopener nofollow">Tickets</a>` : ''}
</div>
<p class="hint" id="installHint" hidden>Eaves isn’t installed yet. Install the app below, then tap “Open in Eaves” again.</p>
<dl class="facts">
${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('\n')}
</dl>
${ev.genres.length ? `<ul class="tags">${ev.genres.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
${lineupHtml}
${ev.description ? `<section class="block"><h2>About</h2><div class="about">${paragraphs(ev.description)}</div></section>` : ''}
<section class="block">
  <h2>See who’s going</h2>
  <p class="muted">In the app you see which friends are going, can tap Going or Interested and invite your own friends.</p>
  ${storeBadges()}
</section>
</main>`;

  return layout({
    title: `${ev.title} in Leuven | Eaves`,
    description: metaDescription,
    canonical,
    image: ev.cover ?? DEFAULT_OG_IMAGE,
    extraHead:
      `<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=eaves://event/${ev.id}">\n` +
      `<script type="application/ld+json">${jsonLd(structured)}</script>`,
    body,
    script: '<script src="/assets/event-open.js" defer></script>',
  });
}

function eventRow(ev, { withDay }) {
  const price = formatPrice(ev.price);
  const when = withDay
    ? `${esc(dayShortFormat.format(ev.start))}<br>${esc(timeFormat.format(ev.start))}`
    : esc(timeFormat.format(ev.start));
  return `<li${ev.isStudent ? ' data-student="1"' : ''}><a href="/event/${ev.id}/"><span class="et">${when}</span><span class="en">${esc(ev.title)}${ev.placeName ? `<span class="em">${esc(ev.placeName)}</span>` : ''}</span><span class="ep">${price ? esc(price) : ''}</span></a></li>`;
}

// The overview. When the list holds both student and other events, a switch
// above it lets visitors hide the student events (see site.js). Without
// JavaScript the switch stays hidden and every event is listed.
function renderListingPage(events) {
  const studentCount = events.filter((ev) => ev.isStudent).length;
  const showSwitch = studentCount > 0 && studentCount < events.length;

  const groups = new Map();
  for (const ev of events) {
    if (!groups.has(ev.nightKey)) groups.set(ev.nightKey, []);
    groups.get(ev.nightKey).push(ev);
  }

  const days = [...groups.entries()]
    .map(([key, list]) => {
      const rows = list.map((ev) => eventRow(ev, { withDay: false })).join('\n');
      return `<section class="day"><h2>${esc(formatNightLabel(key))}</h2><ul class="elist">${rows}</ul></section>`;
    })
    .join('\n');

  const count = `${events.length} upcoming ${events.length === 1 ? 'event' : 'events'}`;
  const toggle = showSwitch
    ? `<label class="switch" id="studentSwitch" hidden><input type="checkbox" role="switch" checked><span class="track" aria-hidden="true"><span class="thumb"></span></span><span>Student events</span></label>`
    : '';

  const body = `<main class="evp">
<h1>Upcoming events in Leuven</h1>
<p class="lead muted">Club nights, student parties and concerts. Open Eaves to see which friends are going.</p>
<div class="toolbar"><p class="count" id="eventCount">${count}</p>${toggle}</div>
<div id="eventList">
${days || '<p class="lead muted">No upcoming events yet. Check back soon.</p>'}
</div>
<section class="block">
  <h2>Get the app</h2>
  <p class="muted">Follow artists, venues and hosts, and see who’s going.</p>
  ${storeBadges()}
</section>
</main>`;

  return layout({
    title: 'Upcoming events in Leuven | Eaves',
    description: 'Club nights, student parties and concerts in Leuven. See what is on and which friends are going with the Eaves app.',
    canonical: `${SITE_ORIGIN}/events/`,
    image: DEFAULT_OG_IMAGE,
    body,
    script: `<script src="/assets/site.js?v=${JS_VERSION}" defer></script>`,
  });
}

// Compact strip for the homepage. Empty when there are too few events,
// because a nearly empty calendar looks dead.
function renderEventsStrip(events) {
  const next = events.slice(0, HOME_STRIP_MAX);
  if (next.length < HOME_STRIP_MIN) return '';
  return `<section class="events" id="events"><div class="wrap">
  <h2>On in Leuven</h2>
  <ul class="elist">${next.map((ev) => eventRow(ev, { withDay: true })).join('\n')}</ul>
  <p class="note"><a class="link" href="/events/">All upcoming events</a>. Open the app to see which friends are going.</p>
</div></section>`;
}

function renderSitemap(events) {
  const urls = [
    ...STATIC_PAGES.map((page) => ({ loc: `${SITE_ORIGIN}${page}` })),
    ...events.map((ev) => ({
      loc: `${SITE_ORIGIN}/event/${ev.id}/`,
      lastmod: ev.updatedAt ? ev.updatedAt.toISOString().slice(0, 10) : undefined,
    })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function writePage(relativePath, content) {
  const file = path.join(OUT_DIR, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
}

// Replaces the marker in the copy of index.html inside OUT_DIR. Never point
// OUT_DIR at the source folder, or the marker is lost for good.
async function injectHomeStrip(events) {
  const file = path.join(OUT_DIR, 'index.html');
  let html;
  try {
    html = await readFile(file, 'utf8');
  } catch {
    console.warn('build-events: no index.html in OUT_DIR, skipping events strip');
    return;
  }
  if (!html.includes(HOME_MARKER)) fail(`index.html has no ${HOME_MARKER} marker`);
  await writeFile(file, html.replace(HOME_MARKER, () => renderEventsStrip(events)), 'utf8');
}

async function main() {
  const nightStart = currentNightStart();
  const { events: rawEvents } = EVENTS_FIXTURE
    ? await loadFromFixture(EVENTS_FIXTURE)
    : await loadFromSupabase();

  // Defensive second filter: the feed already limits the rows, but the page
  // set must never depend on that alone.
  const events = rawEvents
    .map((raw) => normalizeEvent(raw))
    .filter(Boolean)
    .filter((ev) => (ev.end ?? ev.start) >= nightStart)
    .sort((a, b) => a.start - b.start);

  await rm(path.join(OUT_DIR, 'event'), { recursive: true, force: true });
  await rm(path.join(OUT_DIR, 'events'), { recursive: true, force: true });

  for (const ev of events) await writePage(`event/${ev.id}/index.html`, renderEventPage(ev));
  await writePage('events/index.html', renderListingPage(events));
  await injectHomeStrip(events);
  await writePage('sitemap.xml', renderSitemap(events));
  await writePage('robots.txt', `User-agent: *\nAllow: /\nDisallow: /auth/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);

  console.log(`build-events: wrote ${events.length} event pages to ${OUT_DIR}`);
}

main().catch((error) => fail(error instanceof Error ? error.stack : String(error)));