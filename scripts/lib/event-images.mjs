// Renders the share images of an event at build time:
//
//   og.jpg     1200x630   link preview (WhatsApp, iMessage, Facebook, X)
//   story.jpg  1080x1920  9:16 card the app downloads for "share as image"
//
// Events with a cover hosted by us use the resized cover as og.jpg (the flyer
// is the best preview). Every other event gets a branded card, so no
// third-party image is ever copied. Cards are drawn with satori (JSX-like
// tree to SVG) and rasterised with sharp.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import satori from 'satori';
import { eventTypeLabel, genreLabel } from './labels.mjs';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

const TIME_ZONE = 'Europe/Brussels';

const COLOR = {
  bg: '#121212',
  red: '#C4000A',
  redBright: '#E8000E',
  text: '#F7F5F2',
  muted: '#CBC7C1',
  line: 'rgba(255,255,255,0.16)',
};

// WhatsApp drops previews for heavy images; stay well below ~300 KB.
const OG_MAX_BYTES = 280 * 1024;
const COVER_TIMEOUT_MS = 15_000;
const COVER_MAX_BYTES = 15 * 1024 * 1024;

// The fontsource "latin" subset covers Basic Latin, Latin-1 and common
// punctuation. Anything else (emoji, exotic scripts) would render as an empty
// box, so it is removed from card text.
const UNSUPPORTED_CHARS = /[^\u0020-\u007E\u00A0-\u00FF\u0131\u0152\u0153\u2013\u2014\u2018-\u201D\u2026\u20AC]/g;

// Letters without a canonical decomposition, so NFD alone cannot reduce them.
const LETTER_FALLBACKS = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', Ħ: 'H', ħ: 'h' };

// Reduces letters outside the font subset to their base letter (ź to z,
// Ł to L); whatever is still unsupported afterwards (emoji, other scripts)
// is removed.
function toSupportedText(value) {
  return Array.from(String(value ?? ''))
    .map((char) => {
      if (!UNSUPPORTED_CHARS.test(char)) {
        UNSUPPORTED_CHARS.lastIndex = 0;
        return char;
      }
      UNSUPPORTED_CHARS.lastIndex = 0;
      const base = LETTER_FALLBACKS[char] ?? char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return base.replace(UNSUPPORTED_CHARS, '');
    })
    .join('');
}

// ── Card data ─────────────────────────────────────────────────────────────────

const CARD_LANG = 'nl';
const MAX_TAGS = 3;

const dateFormat = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const timeFormat = new Intl.DateTimeFormat('nl-BE', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const endDayFormat = new Intl.DateTimeFormat('nl-BE', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

function cleanText(value, max) {
  const cleaned = toSupportedText(value)
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function formatPrice(price) {
  if (price === null || price === undefined) return null;
  if (price === 0) return 'Gratis';
  return `€${price.toFixed(2).replace(/\.00$/, '').replace('.', ',')}`;
}

// "21:00 – 05:00" within one night; an event that runs into another night
// names the end day as well ("21:00 – zo 16 aug. 02:00").
function formatTimeLabel(ev) {
  const start = timeFormat.format(ev.start);
  if (!ev.end) return `Vanaf ${start}`;
  const end = timeFormat.format(ev.end);
  if (ev.endNightKey && ev.endNightKey !== ev.nightKey) {
    return `${start} – ${endDayFormat.format(ev.end)} ${end}`;
  }
  return `${start} – ${end}`;
}

/**
 * Plain, pre-formatted data for the cards. `ev` is the normalised event of
 * build-events.mjs; the night day (nightKey) is used for the date so an event
 * at 01:00 still belongs to the evening it started on.
 */
export function buildCard(ev) {
  const day = dateFormat.format(new Date(`${ev.nightKey}T12:00:00Z`));

  const tags = [
    eventTypeLabel(ev.eventType, CARD_LANG),
    ...(ev.genres ?? []).map((genre) => genreLabel(genre, CARD_LANG)),
  ]
    .filter(Boolean)
    .map((tag) => cleanText(tag, 22))
    .filter((tag, index, all) => tag && all.indexOf(tag) === index)
    .slice(0, MAX_TAGS);

  const facts = [formatPrice(ev.price), ev.minAge ? `${ev.minAge}+` : null]
    .filter(Boolean)
    .join('  ·  ');

  const lineup = ev.lineup
    .map((l) => cleanText(l.name, 28))
    .filter(Boolean)
    .slice(0, 3);

  return {
    title: cleanText(ev.title, 90) || 'Event',
    dateLabel: day.charAt(0).toUpperCase() + day.slice(1),
    timeLabel: formatTimeLabel(ev),
    place: cleanText(ev.placeName, 42),
    tags,
    facts,
    lineup,
  };
}

// ── Satori helpers ────────────────────────────────────────────────────────────

// Every element is a flex container (satori requires an explicit display for
// elements with more than one child) and uses border-box sizing: satori
// defaults to content-box, so a padded root would otherwise grow past the
// canvas and push its last row out of the image.
function h(style, children) {
  return {
    type: 'div',
    props: {
      style: { display: 'flex', boxSizing: 'border-box', ...style },
      ...(children === undefined ? {} : { children }),
    },
  };
}

function img(src, width, height, style = {}) {
  return { type: 'img', props: { src, width, height, style: { width, height, ...style } } };
}

function dataUri(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function ogTitleSize(length) {
  if (length <= 18) return 132;
  if (length <= 32) return 108;
  if (length <= 52) return 88;
  return 72;
}

function storyTitleSize(length, hasCover) {
  const scale = hasCover ? 1 : 1.18;
  const base = length <= 14 ? 200 : length <= 24 ? 160 : length <= 40 ? 124 : 100;
  return Math.round(base * scale);
}

function tagPill(label) {
  return h(
    {
      padding: '8px 22px',
      borderRadius: 999,
      border: `2px solid ${COLOR.line}`,
      color: COLOR.muted,
      fontSize: 28,
      fontWeight: 600,
    },
    label,
  );
}

const GLOW = `radial-gradient(circle at 50% 0%, rgba(200,0,10,0.38), rgba(18,18,18,0) 62%)`;

// ── Card trees ────────────────────────────────────────────────────────────────

function brandedOgTree(card, logoUri) {
  return h(
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '52px 64px',
      backgroundColor: COLOR.bg,
      backgroundImage: GLOW,
      fontFamily: 'Inter',
      color: COLOR.text,
    },
    [
      h({ alignItems: 'center', gap: 18 }, [
        img(logoUri, 64, 64, { borderRadius: 15 }),
        h({ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 44 }, 'Eaves'),
      ]),
      h({ flexDirection: 'column', gap: 18 }, [
        h(
          {
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: COLOR.redBright,
            lineClamp: 1,
          },
          `${card.dateLabel}  ·  ${card.timeLabel}`,
        ),
        h(
          {
            fontFamily: 'Barlow Condensed',
            fontWeight: 700,
            fontSize: ogTitleSize(card.title.length),
            lineHeight: 1.02,
            lineClamp: 3,
          },
          card.title,
        ),
      ]),
      h({ justifyContent: 'space-between', alignItems: 'center' }, [
        h({ fontSize: 36, color: COLOR.muted, maxWidth: 820, lineClamp: 1 }, card.place || ' '),
        h({ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 42 }, 'eaves.be'),
      ]),
    ],
  );
}

// 9:16 card. Instagram covers roughly the top 250 and bottom 250 px with its
// own interface, so the content stays inside that safe zone.
//
// Order: cover, date and time, title, tags, venue, price and age, lineup.
// The lineup only appears without a cover: a flyer carries it already, and a
// card without a flyer has the room.
function storyTree(card, logoUri, coverUri) {
  const hasCover = Boolean(coverUri);
  // A cover plus a long title leaves no room for the tags, the least
  // important element.
  const showTags = card.tags.length > 0 && !(hasCover && card.title.length > 36);
  const showLineup = card.lineup.length > 0 && !hasCover;

  return h(
    {
      width: STORY_WIDTH,
      height: STORY_HEIGHT,
      flexDirection: 'column',
      padding: '210px 72px 230px',
      backgroundColor: COLOR.bg,
      backgroundImage: GLOW,
      fontFamily: 'Inter',
      color: COLOR.text,
    },
    [
      hasCover ? img(coverUri, 936, 527, { borderRadius: 28 }) : h({ flexGrow: 1 }),

      h({ flexDirection: 'column', marginTop: hasCover ? 56 : 0 }, [
        h({ alignItems: 'center', flexWrap: 'wrap', gap: 20 }, [
          h(
            {
              padding: '14px 30px',
              borderRadius: 999,
              backgroundColor: COLOR.red,
              fontSize: 36,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: 'uppercase',
            },
            card.dateLabel,
          ),
          h({ fontSize: 40, fontWeight: 600 }, card.timeLabel),
        ]),
        h(
          {
            marginTop: 34,
            fontFamily: 'Barlow Condensed',
            fontWeight: 700,
            fontSize: storyTitleSize(card.title.length, hasCover),
            lineHeight: 1.0,
            lineClamp: hasCover ? 3 : 5,
          },
          card.title,
        ),
        ...(showTags
          ? [h({ flexWrap: 'wrap', gap: 12, marginTop: 36 }, card.tags.map((tag) => tagPill(tag)))]
          : []),
        ...(card.place
          ? [h({ marginTop: 40, fontSize: 46, fontWeight: 600, lineClamp: 1 }, card.place)]
          : []),
        ...(card.facts
          ? [h({ marginTop: card.place ? 8 : 40, fontSize: 40, color: COLOR.muted }, card.facts)]
          : []),
        ...(showLineup
          ? [h({ marginTop: 34, fontSize: 36, color: COLOR.muted, lineClamp: 1 }, card.lineup.join('  ·  '))]
          : []),
      ]),

      h({ flexGrow: 1 }),

      h(
        {
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: `2px solid ${COLOR.line}`,
          paddingTop: 36,
          marginTop: 48,
          flexShrink: 0,
        },
        [
          h({ alignItems: 'center', gap: 18 }, [
            img(logoUri, 56, 56, { borderRadius: 14 }),
            h({ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 60 }, 'eaves.be'),
          ]),
          h({ fontSize: 30, color: COLOR.muted }, 'Zie wie er gaat in de app'),
        ],
      ),
    ],
  );
}

// ── Renderer ──────────────────────────────────────────────────────────────────

async function loadFonts(repoRoot) {
  const font = (pkg, file) => readFile(path.join(repoRoot, 'node_modules', pkg, 'files', file));
  const [barlow700, inter400, inter600] = await Promise.all([
    font('@fontsource/barlow-condensed', 'barlow-condensed-latin-700-normal.woff'),
    font('@fontsource/inter', 'inter-latin-400-normal.woff'),
    font('@fontsource/inter', 'inter-latin-600-normal.woff'),
  ]);
  return [
    { name: 'Barlow Condensed', data: barlow700, weight: 700, style: 'normal' },
    { name: 'Inter', data: inter400, weight: 400, style: 'normal' },
    { name: 'Inter', data: inter600, weight: 600, style: 'normal' },
  ];
}

/**
 * Downloads a cover. Returns null on any problem (network error, not an
 * image, too large, unreadable): the caller then falls back to the branded
 * card instead of failing the build.
 */
export async function fetchCover(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(COVER_TIMEOUT_MS) });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? '';
    if (!type.startsWith('image/') || type.includes('svg')) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > COVER_MAX_BYTES) return null;
    await sharp(buffer).metadata();
    return buffer;
  } catch {
    return null;
  }
}

async function jpegUnderLimit(makePipeline, maxBytes) {
  let last = null;
  for (const quality of [84, 76, 68, 58]) {
    last = await makePipeline().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (last.length <= maxBytes) return last;
  }
  return last;
}

export async function createEventImageRenderer({ repoRoot }) {
  const [fonts, logo] = await Promise.all([
    loadFonts(repoRoot),
    sharp(path.join(repoRoot, 'assets', 'icon.png')).resize(160, 160).png().toBuffer(),
  ]);
  const logoUri = dataUri(logo, 'image/png');

  const draw = async (tree, width, height) => {
    const svg = await satori(tree, { width, height, fonts });
    return sharp(Buffer.from(svg));
  };

  return {
    /** 1200x630 link preview. */
    async renderOg(card, cover) {
      if (cover) {
        return jpegUnderLimit(
          () => sharp(cover).rotate().resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover' }),
          OG_MAX_BYTES,
        );
      }
      const raster = await draw(brandedOgTree(card, logoUri), OG_WIDTH, OG_HEIGHT);
      return jpegUnderLimit(() => raster.clone(), OG_MAX_BYTES);
    },

    /** 1080x1920 story card. */
    async renderStory(card, cover) {
      const coverBuffer = cover
        ? await sharp(cover).rotate().resize(936, 527, { fit: 'cover' }).jpeg({ quality: 86 }).toBuffer()
        : null;
      const coverUri = coverBuffer ? dataUri(coverBuffer, 'image/jpeg') : null;
      const raster = await draw(storyTree(card, logoUri, coverUri), STORY_WIDTH, STORY_HEIGHT);
      return raster.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    },
  };
}