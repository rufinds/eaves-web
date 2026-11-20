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
  // Chips follow the app: dark pill, red outline and text for the event type,
  // green for genres. The text is a little lighter than in the app, because a
  // story is read small and often over a blurred cover.
  typeBorder: '#D10010',
  typeText: '#F0343C',
  genreBorder: '#2A8A31',
  genreText: '#34A03B',
  // Price badge on top of the image.
  badgeFill: 'rgba(18,18,18,0.86)',
  badgeBorder: 'rgba(255,255,255,0.22)',
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
const MAX_GENRES = 2;
const MAX_LINEUP = 4;

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
// Night days are plain calendar dates (YYYY-MM-DD), so these use UTC.
const weekdayLongFormat = new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', weekday: 'long' });
const weekdayShortFormat = new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', weekday: 'short' });
const dayNumberFormat = new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', day: 'numeric' });
const monthShortFormat = new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', month: 'short' });
const rangeDayFormat = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
});
const rangeMonthFormat = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'UTC',
  month: 'long',
});
const rangeDayMonthFormat = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'UTC',
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

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Date and time of the event as shown on the cards.
 *
 * One night: the full date and the hours ("21:00 – 05:00").
 * Several nights (a festival, a weekend): only the range of nights and no
 * hours, because the hours differ per day and the start time of the first
 * night says little about the rest.
 *
 * `hero` holds the same date split in three lines (weekday, day, month) for
 * the large date block that replaces the cover of events without one.
 */
function formatWhen(ev) {
  const first = new Date(`${ev.nightKey}T12:00:00Z`);
  const multiNight = Boolean(ev.end && ev.endNightKey && ev.endNightKey > ev.nightKey);

  if (multiNight) {
    const last = new Date(`${ev.endNightKey}T12:00:00Z`);
    const sameMonth = ev.nightKey.slice(0, 7) === ev.endNightKey.slice(0, 7);
    const range = sameMonth
      ? `${rangeDayFormat.format(first)} – ${rangeDayFormat.format(last)} ${rangeMonthFormat.format(last)}`
      : `${rangeDayMonthFormat.format(first)} – ${rangeDayMonthFormat.format(last)}`;
    return {
      dateLabel: capitalize(range),
      timeLabel: null,
      hero: {
        top: `${weekdayShortFormat.format(first)} – ${weekdayShortFormat.format(last)}`,
        big: `${dayNumberFormat.format(first)}–${dayNumberFormat.format(last)}`,
        bottom: sameMonth
          ? rangeMonthFormat.format(last)
          : `${monthShortFormat.format(first)} – ${monthShortFormat.format(last)}`,
      },
    };
  }

  const start = timeFormat.format(ev.start);
  return {
    dateLabel: capitalize(dateFormat.format(first)),
    timeLabel: ev.end ? `${start} – ${timeFormat.format(ev.end)}` : `Vanaf ${start}`,
    hero: {
      top: weekdayLongFormat.format(first),
      big: dayNumberFormat.format(first),
      bottom: rangeMonthFormat.format(first),
    },
  };
}

/**
 * Plain, pre-formatted data for the cards. `ev` is the normalised event of
 * build-events.mjs; the night day (nightKey) is used for the date so an event
 * at 01:00 still belongs to the evening it started on.
 *
 * `chips` is the row of small labels: event type, genres and age, in that
 * order. `kind` decides the style (see chip()). The price is separate: it is
 * shown as a badge in the corner of the image.
 */
export function buildCard(ev) {
  const { dateLabel, timeLabel, hero } = formatWhen(ev);

  const typeLabel = cleanText(eventTypeLabel(ev.eventType, CARD_LANG), 22);
  const genreLabels = (ev.genres ?? [])
    .map((genre) => cleanText(genreLabel(genre, CARD_LANG), 22))
    .filter((label, index, all) => label && label !== typeLabel && all.indexOf(label) === index)
    .slice(0, MAX_GENRES);

  const chips = [
    ...(typeLabel ? [{ kind: 'type', label: typeLabel }] : []),
    ...genreLabels.map((label) => ({ kind: 'genre', label })),
    ...(ev.minAge ? [{ kind: 'age', label: `${ev.minAge}+` }] : []),
  ];

  const lineup = ev.lineup
    .map((l) => cleanText(l.name, 30))
    .filter(Boolean)
    .slice(0, MAX_LINEUP);

  return {
    title: cleanText(ev.title, 90) || 'Event',
    dateLabel,
    timeLabel,
    hero,
    place: cleanText(ev.placeName, 42),
    price: formatPrice(ev.price),
    chips,
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

// ── Title fitting ─────────────────────────────────────────────────────────────

// Barlow Condensed Bold has no metrics available at build time, so text widths
// are estimated per character (measured on rendered cards: about 0.35 to 0.40
// em on average). The wrap factor is used to count lines; the word factor is
// deliberately higher, because a single word that is too wide cannot wrap and
// would run past the margin.
const TITLE_WRAP_FACTOR = 0.39;
const TITLE_WORD_FACTOR = 0.42;
const TITLE_SPACE_FACTOR = 0.2;
const TITLE_MAX_LINES = 3;
const TITLE_MIN_SIZE = 48;
const STORY_TITLE_SIZES = [200, 160, 124, 100, 84, 72];

function longestWord(text) {
  return Math.max(1, ...text.split(' ').map((word) => word.length));
}

// Greedy word wrap with estimated widths; returns the number of lines.
function countTitleLines(text, size, width) {
  const spaceWidth = size * TITLE_SPACE_FACTOR;
  let lines = 1;
  let lineWidth = 0;
  for (const word of text.split(' ')) {
    const wordWidth = word.length * size * TITLE_WRAP_FACTOR;
    if (lineWidth === 0) {
      lineWidth = wordWidth;
    } else if (lineWidth + spaceWidth + wordWidth <= width) {
      lineWidth += spaceWidth + wordWidth;
    } else {
      lines += 1;
      lineWidth = wordWidth;
    }
  }
  return lines;
}

/**
 * Largest title size from the ladder that keeps the longest word inside the
 * margins, stays within TITLE_MAX_LINES and within `maxHeight` (lineHeight 1).
 */
function fitTitle(text, maxHeight, width) {
  const wordCap = Math.floor(width / (longestWord(text) * TITLE_WORD_FACTOR));
  let last = null;
  for (const base of STORY_TITLE_SIZES) {
    const size = Math.max(TITLE_MIN_SIZE, Math.min(base, wordCap));
    const lines = countTitleLines(text, size, width);
    last = { size, lines: Math.min(lines, TITLE_MAX_LINES) };
    if (lines <= TITLE_MAX_LINES && lines * size <= maxHeight) return last;
  }
  return last;
}

function ogTitleSize(text) {
  const length = text.length;
  const base = length <= 18 ? 132 : length <= 32 ? 108 : length <= 52 ? 88 : 72;
  const wordCap = Math.floor((OG_WIDTH - 128) / (longestWord(text) * TITLE_WORD_FACTOR));
  return Math.max(TITLE_MIN_SIZE, Math.min(base, wordCap));
}

// ── Chips and price badge ─────────────────────────────────────────────────────

const CHIP_FONT_SIZE = 30;
const CHIP_PADDING_X = 24;
const CHIP_PADDING_Y = 10;
const CHIP_BORDER = 2;
const CHIP_HEIGHT = 60;
const CHIP_GAP = 12;
// Average glyph width of Inter SemiBold relative to the font size.
const CHIP_CHAR_WIDTH = 0.58;

// Dark pill with a coloured outline and text. Type: red. Genre: green (same
// as the app). Age: neutral.
function chip(item, { fontSize = CHIP_FONT_SIZE, padX = CHIP_PADDING_X, padY = CHIP_PADDING_Y } = {}) {
  const styles = {
    type: { borderColor: COLOR.typeBorder, color: COLOR.typeText },
    genre: { borderColor: COLOR.genreBorder, color: COLOR.genreText },
    age: { borderColor: COLOR.line, color: COLOR.muted },
  };
  return h(
    {
      padding: `${padY}px ${padX}px`,
      borderRadius: 999,
      fontSize,
      fontWeight: 600,
      border: `${CHIP_BORDER}px solid`,
      backgroundColor: COLOR.bg,
      ...styles[item.kind],
    },
    item.label,
  );
}

// Number of rows the chips take when they wrap inside `width`.
function countChipRows(chips, width) {
  if (chips.length === 0) return 0;
  let rows = 1;
  let rowWidth = 0;
  for (const item of chips) {
    const chipWidth =
      item.label.length * CHIP_FONT_SIZE * CHIP_CHAR_WIDTH + 2 * (CHIP_PADDING_X + CHIP_BORDER);
    if (rowWidth === 0) {
      rowWidth = chipWidth;
    } else if (rowWidth + CHIP_GAP + chipWidth <= width) {
      rowWidth += CHIP_GAP + chipWidth;
    } else {
      rows += 1;
      rowWidth = chipWidth;
    }
  }
  return rows;
}

// Price in a dark, slightly transparent pill. It sits in the corner of the
// image, so it has to read on a red date block as well as on any flyer.
// `extra` positions it (absolute inside the image, or in a header row).
function priceBadge(label, { fontSize = 38, padX = 28, padY = 12, ...extra } = {}) {
  return h(
    {
      padding: `${padY}px ${padX}px`,
      borderRadius: 999,
      fontSize,
      fontWeight: 600,
      color: COLOR.text,
      backgroundColor: COLOR.badgeFill,
      border: `2px solid ${COLOR.badgeBorder}`,
      ...extra,
    },
    label,
  );
}

const BADGE_INSET = 28;

// Large date block shown where the cover would be, for events without a
// cover of their own (about half of them): the date is the most useful thing
// to see at a glance, and it keeps both kinds of card laid out the same way.
// The day number grows with the block, so a tall block is not left empty.
function dateHero(hero, height, price) {
  const tall = height >= 640;
  const isRange = hero.big.length > 3;
  const bigSize = isRange ? (tall ? 300 : 250) : tall ? 400 : 340;
  return h(
    {
      position: 'relative',
      width: 936,
      height,
      flexShrink: 0,
      borderRadius: 28,
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '0 72px',
      backgroundImage: 'linear-gradient(135deg, #C4000A 0%, #5A0000 100%)',
      color: COLOR.text,
    },
    [
      h(
        { fontSize: 40, fontWeight: 600, letterSpacing: 8, textTransform: 'uppercase', opacity: 0.85 },
        hero.top,
      ),
      h({ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: bigSize, lineHeight: 0.95 }, hero.big),
      h({ fontSize: 52, fontWeight: 600, letterSpacing: 10, textTransform: 'uppercase' }, hero.bottom),
      ...(price ? [priceBadge(price, { position: 'absolute', top: BADGE_INSET, right: BADGE_INSET })] : []),
    ],
  );
}

const GLOW = `radial-gradient(circle at 50% 0%, rgba(200,0,10,0.38), rgba(18,18,18,0) 62%)`;

// ── Story layout planning ─────────────────────────────────────────────────────

// Instagram covers roughly the top 250 and bottom 250 px with its own
// interface, so the content stays inside this height.
const STORY_PAD_TOP = 210;
const STORY_PAD_BOTTOM = 230;
const STORY_PAD_X = 72;
const STORY_CONTENT_HEIGHT = STORY_HEIGHT - STORY_PAD_TOP - STORY_PAD_BOTTOM;
const STORY_CONTENT_WIDTH = STORY_WIDTH - 2 * STORY_PAD_X;

// A cover keeps its 16:9 shape. The date block of events without a cover is
// flexible: it takes the space the other blocks leave over.
const COVER_HEIGHT = 527;
const HERO_MIN = 380;
const HERO_MAX = 760;

// Date row of a card with a cover: a red pill with the date, followed by the
// hours. Both sit on one row when they fit, otherwise the hours wrap.
const WHEN_PILL_FONT_SIZE = 36;
const WHEN_PILL_PADDING_X = 30;
const WHEN_PILL_CHAR_WIDTH = 0.68; // uppercase with letter spacing
const WHEN_TIME_FONT_SIZE = 40;
const WHEN_TIME_CHAR_WIDTH = 0.56;
const WHEN_ROW_GAP = 20;

// Block heights (px). Rows that depend on the font are estimated slightly
// high, so the card never runs into the footer.
const VISUAL_GAP = 56;
const WHEN_PILL_HEIGHT = 74;
const WHEN_TEXT_HEIGHT = 54;
const WHEN_GAP = 34;
const PLACE_MARGIN = 40;
const PLACE_HEIGHT = 64;
const PLACE_FONT_SIZE = 52;
const CHIPS_MARGIN = 32;
const LINEUP_MARGIN = 32;
const LINEUP_ROW = 54;
const FOOTER_HEIGHT = 112;
const FOOTER_GAP = 40;

// Title heights tried in order; a smaller title is only used when the card
// does not fit otherwise.
const TITLE_MAX_HEIGHTS = [380, 300, 230];

// Height of the date row below the cover (pill and hours, one or two rows).
function coverWhenHeight(card) {
  const pillWidth = card.dateLabel.length * WHEN_PILL_FONT_SIZE * WHEN_PILL_CHAR_WIDTH + 2 * WHEN_PILL_PADDING_X;
  const timeWidth = card.timeLabel ? card.timeLabel.length * WHEN_TIME_FONT_SIZE * WHEN_TIME_CHAR_WIDTH : 0;
  const total = timeWidth > 0 ? pillWidth + WHEN_ROW_GAP + timeWidth : pillWidth;
  return total <= STORY_CONTENT_WIDTH ? WHEN_PILL_HEIGHT : WHEN_PILL_HEIGHT + WHEN_ROW_GAP + WHEN_TEXT_HEIGHT;
}

/**
 * Decides the size of every flexible part of the story card, so that the
 * content always fits inside the safe zone and nothing is squeezed by the
 * layout engine.
 *
 * Title, date, venue and chips always stay. Only the lineup is optional: it is
 * added when at least two names fit. The date block takes whatever space is
 * left, up to HERO_MAX; a cover keeps its fixed height.
 */
function planStory(card, hasCover) {
  const hasWhenRow = hasCover || Boolean(card.timeLabel);
  const whenBlock = hasWhenRow ? (hasCover ? coverWhenHeight(card) : WHEN_TEXT_HEIGHT) + WHEN_GAP : 0;
  const placeBlock = card.place ? PLACE_MARGIN + PLACE_HEIGHT : 0;
  const chipRows = countChipRows(card.chips, STORY_CONTENT_WIDTH);
  const chipsBlock = chipRows > 0 ? CHIPS_MARGIN + chipRows * CHIP_HEIGHT + (chipRows - 1) * CHIP_GAP : 0;
  const visualMin = hasCover ? COVER_HEIGHT : HERO_MIN;

  let title = null;
  let room = 0;
  for (const maxHeight of TITLE_MAX_HEIGHTS) {
    title = fitTitle(card.title, maxHeight, STORY_CONTENT_WIDTH);
    const fixed =
      VISUAL_GAP + whenBlock + title.size * title.lines + placeBlock + chipsBlock + FOOTER_GAP + FOOTER_HEIGHT;
    room = STORY_CONTENT_HEIGHT - fixed - visualMin;
    if (room >= 0) break;
  }

  let lineupCount = 0;
  if (card.lineup.length > 0) {
    const wanted = Math.min(card.lineup.length, hasCover ? 3 : MAX_LINEUP);
    const count = Math.min(wanted, Math.floor((room - LINEUP_MARGIN) / LINEUP_ROW));
    if (count >= Math.min(2, wanted)) {
      lineupCount = count;
      room -= LINEUP_MARGIN + count * LINEUP_ROW;
    }
  }

  const visualHeight = hasCover ? COVER_HEIGHT : Math.min(HERO_MAX, HERO_MIN + Math.max(0, room));

  return { titleSize: title.size, lineupCount, visualHeight };
}

// ── Card trees ────────────────────────────────────────────────────────────────

// Chips of the link preview: type and first genre, and only when the title
// leaves room for them.
function ogChips(card, titleSize) {
  const chips = [
    card.chips.find((item) => item.kind === 'type'),
    card.chips.find((item) => item.kind === 'genre'),
  ].filter(Boolean);
  const titleLines = Math.min(3, countTitleLines(card.title, titleSize, OG_WIDTH - 128));
  return titleLines * titleSize * 1.02 <= 240 ? chips : [];
}

function brandedOgTree(card, logoUri) {
  const titleSize = ogTitleSize(card.title);
  const chips = ogChips(card, titleSize);

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
      h({ alignItems: 'center', justifyContent: 'space-between' }, [
        h({ alignItems: 'center', gap: 18 }, [
          img(logoUri, 64, 64, { borderRadius: 15 }),
          h({ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 44 }, 'Eaves'),
        ]),
        ...(card.price ? [priceBadge(card.price, { fontSize: 34, padX: 26, padY: 10 })] : []),
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
          card.timeLabel ? `${card.dateLabel}  ·  ${card.timeLabel}` : card.dateLabel,
        ),
        h(
          {
            fontFamily: 'Barlow Condensed',
            fontWeight: 700,
            fontSize: titleSize,
            lineHeight: 1.02,
            lineClamp: 3,
          },
          card.title,
        ),
        ...(chips.length > 0
          ? [h({ flexWrap: 'wrap', gap: 10 }, chips.map((item) => chip(item, { fontSize: 26, padX: 20, padY: 8 })))]
          : []),
      ]),
      h({ justifyContent: 'space-between', alignItems: 'center' }, [
        h({ fontSize: 36, color: COLOR.muted, maxWidth: 820, lineClamp: 1 }, card.place || ' '),
        h({ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 42 }, 'eaves.be'),
      ]),
    ],
  );
}

// Venue on one line with a red bar in front of it, no label.
function placeRow(place) {
  return h({ marginTop: PLACE_MARGIN, alignItems: 'center', gap: 24 }, [
    h({ width: 8, height: 52, borderRadius: 4, backgroundColor: COLOR.red, flexShrink: 0 }),
    h({ fontSize: PLACE_FONT_SIZE, fontWeight: 600, maxWidth: 840, flexShrink: 1, lineClamp: 1 }, place),
  ]);
}

// 9:16 card, laid out inside the Instagram safe zone. Sizes come from
// planStory().
//
// Top: the cover, or a large date block when the event has no cover. The
// price badge sits in the top right corner of either.
// Then: date and time (cover) or time only (date block), title, venue, a row
// of chips (type, genres, age) and the lineup when there is room.
// Bottom: logo and a plain call to action.
//
// With a cover the root has no background of its own: the renderer draws a
// blurred, darkened copy of the cover behind the card (see storyBackdrop).
function storyTree(card, plan, logoUri, coverUri) {
  const hasCover = Boolean(coverUri);

  const whenRow = hasCover
    ? h({ alignItems: 'center', flexWrap: 'wrap', gap: WHEN_ROW_GAP }, [
        h(
          {
            padding: `14px ${WHEN_PILL_PADDING_X}px`,
            borderRadius: 999,
            backgroundColor: COLOR.red,
            fontSize: WHEN_PILL_FONT_SIZE,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: 'uppercase',
          },
          card.dateLabel,
        ),
        ...(card.timeLabel ? [h({ fontSize: WHEN_TIME_FONT_SIZE, fontWeight: 600 }, card.timeLabel)] : []),
      ])
    : card.timeLabel
      ? h({ fontSize: 44, fontWeight: 600 }, card.timeLabel)
      : null;

  const visual = hasCover
    ? h({ position: 'relative', width: STORY_CONTENT_WIDTH, height: plan.visualHeight, flexShrink: 0 }, [
        img(coverUri, STORY_CONTENT_WIDTH, plan.visualHeight, { borderRadius: 28 }),
        ...(card.price ? [priceBadge(card.price, { position: 'absolute', top: BADGE_INSET, right: BADGE_INSET })] : []),
      ])
    : dateHero(card.hero, plan.visualHeight, card.price);

  return h(
    {
      width: STORY_WIDTH,
      height: STORY_HEIGHT,
      flexDirection: 'column',
      padding: `${STORY_PAD_TOP}px ${STORY_PAD_X}px ${STORY_PAD_BOTTOM}px`,
      fontFamily: 'Inter',
      color: COLOR.text,
      ...(hasCover ? {} : { backgroundColor: COLOR.bg, backgroundImage: GLOW }),
    },
    [
      visual,

      h({ flexDirection: 'column', flexShrink: 0, marginTop: VISUAL_GAP }, [
        ...(whenRow ? [whenRow] : []),
        h(
          {
            marginTop: whenRow ? WHEN_GAP : 0,
            fontFamily: 'Barlow Condensed',
            fontWeight: 700,
            fontSize: plan.titleSize,
            lineHeight: 1.0,
            lineClamp: TITLE_MAX_LINES,
          },
          card.title,
        ),
        ...(card.place ? [placeRow(card.place)] : []),
        ...(card.chips.length > 0
          ? [h({ flexWrap: 'wrap', gap: CHIP_GAP, marginTop: CHIPS_MARGIN }, card.chips.map((item) => chip(item)))]
          : []),
        ...(plan.lineupCount > 0
          ? [
              h(
                { flexDirection: 'column', gap: 6, marginTop: LINEUP_MARGIN },
                card.lineup
                  .slice(0, plan.lineupCount)
                  .map((name) => h({ fontSize: 40, fontWeight: 600, color: COLOR.muted, lineClamp: 1 }, name)),
              ),
            ]
          : []),
      ]),

      h({ flexGrow: 1 }),

      h(
        {
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: `2px solid ${COLOR.line}`,
          paddingTop: 36,
          marginTop: FOOTER_GAP,
          flexShrink: 0,
        },
        [
          h({ alignItems: 'center', gap: 18 }, [
            img(logoUri, 56, 56, { borderRadius: 14 }),
            h({ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 60 }, 'eaves.be'),
          ]),
          h({ fontSize: 34, fontWeight: 600 }, 'Bekijk in de app'),
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

// Darkening gradient over the blurred cover: keeps the text readable and
// the card dark at the top and bottom, where the interface sits.
const BACKDROP_SHADE = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${STORY_WIDTH}" height="${STORY_HEIGHT}">` +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#121212" stop-opacity="0.55"/>' +
    '<stop offset="0.5" stop-color="#121212" stop-opacity="0.75"/>' +
    '<stop offset="1" stop-color="#121212" stop-opacity="0.95"/>' +
    '</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>',
);

// Full-canvas background for cards with a cover: the cover scaled up, blurred
// and darkened, so the card is filled with the colours of the flyer.
async function storyBackdrop(cover) {
  const blurred = await sharp(cover)
    .rotate()
    .resize(STORY_WIDTH, STORY_HEIGHT, { fit: 'cover' })
    .blur(40)
    .modulate({ brightness: 0.8, saturation: 1.1 })
    .toBuffer();
  return sharp(blurred).composite([{ input: BACKDROP_SHADE }]).png().toBuffer();
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
      const plan = planStory(card, Boolean(cover));

      const coverBuffer = cover
        ? await sharp(cover)
            .rotate()
            .resize(STORY_CONTENT_WIDTH, plan.visualHeight, { fit: 'cover' })
            .jpeg({ quality: 86 })
            .toBuffer()
        : null;
      const coverUri = coverBuffer ? dataUri(coverBuffer, 'image/jpeg') : null;
      const raster = await draw(storyTree(card, plan, logoUri, coverUri), STORY_WIDTH, STORY_HEIGHT);

      // Cards with a cover are drawn on a transparent canvas and composited
      // over the blurred backdrop; cards without a cover carry their own
      // background.
      if (!cover) return raster.jpeg({ quality: 88, mozjpeg: true }).toBuffer();

      const [backdrop, overlay] = await Promise.all([storyBackdrop(cover), raster.png().toBuffer()]);
      return sharp(backdrop)
        .composite([{ input: overlay }])
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
    },
  };
}