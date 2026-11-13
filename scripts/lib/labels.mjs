// Display labels for the event_type_enum and genre_enum values of the
// database, used on the event pages (English) and on the share cards (Dutch).
//
// A missing entry falls back to the enum value with underscores replaced by
// spaces, so a new enum value never shows up as "hip_hop" on the site.

const EVENT_TYPE_LABELS = {
  nl: {
    concert:       'Concert',
    club_night:    'Clubnacht',
    festival:      'Festival',
    party:         'Feest',
    rave:          'Rave',
    open_air:      'Open air',
    student_event: 'Studentenevent',
    live_session:  'Live sessie',
  },
  en: {
    concert:       'Concert',
    club_night:    'Club night',
    festival:      'Festival',
    party:         'Party',
    rave:          'Rave',
    open_air:      'Open air',
    student_event: 'Student event',
    live_session:  'Live session',
  },
};

// Genre names are mostly the same in both languages; only the differing ones
// are listed per language.
const GENRE_LABELS = {
  rock: 'Rock',
  metal: 'Metal',
  punk: 'Punk',
  indie: 'Indie',
  blues: 'Blues',
  techno: 'Techno',
  house: 'House',
  trance: 'Trance',
  drum_and_bass: 'Drum & bass',
  dubstep: 'Dubstep',
  hardstyle: 'Hardstyle',
  hardcore: 'Hardcore',
  ambient: 'Ambient',
  experimental: 'Experimental',
  edm: 'EDM',
  hip_hop: 'Hip hop',
  rap: 'Rap',
  trap: 'Trap',
  r_and_b: 'R&B',
  grime: 'Grime',
  k_pop: 'K-pop',
  soul: 'Soul',
  funk: 'Funk',
  disco: 'Disco',
  jazz: 'Jazz',
  classical: 'Classical',
  folk: 'Folk',
  country: 'Country',
  pop: 'Pop',
  afrobeat: 'Afrobeat',
  afro_house: 'Afro house',
  reggae: 'Reggae',
  latin: 'Latin',
  world: 'World',
  dub: 'Dub',
  deep_house: 'Deep house',
  tech_house: 'Tech house',
  uk_garage: 'UK garage',
  hard_techno: 'Hard techno',
  melodic_techno: 'Melodic techno',
  psytrance: 'Psytrance',
  jungle: 'Jungle',
  liquid_dnb: 'Liquid DnB',
  neurofunk: 'Neurofunk',
  jump_up: 'Jump up',
  amapiano: 'Amapiano',
  dancehall: 'Dancehall',
  singer_songwriter: 'Singer-songwriter',
  hardcore_punk: 'Hardcore punk',
};

const GENRE_LABEL_OVERRIDES = {
  nl: {
    experimental: 'Experimenteel',
    classical:    'Klassiek',
    world:        'Wereldmuziek',
  },
  en: {},
};

function prettify(value) {
  const text = String(value).replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Label of an event type, or null when nothing useful can be shown
 * ("other" says nothing, so it is left out).
 */
export function eventTypeLabel(type, lang = 'en') {
  if (!type || type === 'other') return null;
  return EVENT_TYPE_LABELS[lang]?.[type] ?? prettify(type);
}

export function genreLabel(genre, lang = 'en') {
  if (!genre) return null;
  return GENRE_LABEL_OVERRIDES[lang]?.[genre] ?? GENRE_LABELS[genre] ?? prettify(genre);
}