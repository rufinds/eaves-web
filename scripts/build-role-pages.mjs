// Generates the role pages (hosts, artists, venues) from the content below.
// Run: node scripts/build-role-pages.mjs. The output is committed to the repo.
// Adding a language means adding an entry to LANGS: pages, canonical URLs and
// hreflang links follow automatically.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'https://eaves.be';
const APP_STORE_URL = 'https://apps.apple.com/app/id6794866218';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.eaves.app';

const LANGS = {
  en: {
    htmlLang: 'en',
    outDir: '',
    ui: {
      download: 'Download',
      nav: [['/#features', 'Features'], ['/events/', 'Events'], ['/#creators', 'For creators'], ['/#faq', 'FAQ']],
      doTitle: 'What you can do',
      startTitle: 'How to start',
      step1: ['Download Eaves', 'Get the app on iPhone or Android and create your account.'],
      faqTitle: 'Questions',
      moreTitle: 'More on Eaves',
      qr: 'On a computer? Scan the code with your phone to get the app.',
      qrAlt: 'QR code to download Eaves',
      finalTitle: 'Ready when you are.',
      finalText: 'Download Eaves and choose your role. It’s free for everyone.',
      appStoreAlt: 'Download on the App Store',
      playAlt: 'Get it on Google Play',
      // FAQ items shared by several role pages. A role refers to them by key.
      sharedFaq: {
        free: ['Does it cost anything?', 'No. Eaves is completely free for every role: users, hosts, artists and venues.'],
        multiRole: ['Can I have multiple roles?', 'Yes. One account can have multiple roles, such as Artist and Host. You can switch between active roles in your profile.'],
      },
      footer: [
        ['/privacy.html', 'Privacy policy'], ['/terms.html', 'Terms of service'], ['/events/', 'Upcoming events'],
        ['/for-hosts/', 'For hosts'], ['/for-artists/', 'For artists'], ['/for-venues/', 'For venues'],
        ['/delete-account.html', 'Delete account'], ['https://instagram.com/eaves.app', 'Instagram'],
      ],
    },
    roles: {
      hosts: {
        slug: 'for-hosts',
        title: 'For hosts: create events and build lineups in Leuven | Eaves',
        desc: 'Create public events, build stage-by-stage lineups and connect with artists and venues on Eaves. Free for hosts in Leuven.',
        pill: 'For hosts',
        h1: ['Bring your', 'event to life.'],
        lead: 'From small club nights to larger music events, Eaves helps you bring everything together. Create your event, build the lineup, invite artists and connect with venues, all in one place.',
        blurb: 'Create events, build lineups and invite artists.',
        // Hero screenshot, and the onboarding screenshot with this role selected.
        shot: ['phone-details-720.webp', 'Eaves event details with date, price, age limit and friends attending'],
        rolesShot: ['phone-role-host-720.webp', 'Eaves role selection with the Host role selected'],
        cards: [
          ['Create your event', 'Add everything people need to know: event details, dates, location, price, ticket link, age limit, genres and images. Save a draft and publish when you’re ready.'],
          ['Build your lineup', 'Put together your lineup stage by stage, with artists and set times. Add registered artists or guest artists, send invitations and get notified about their responses. Eaves also flags overlapping slots.'],
          ['Connect with venues', 'Find venues on Eaves and request to host your event there. The venue owner can review and approve or decline your request in the app.'],
          ['Manage and share', 'Edit, duplicate or cancel your events and keep an eye on Going and Interested responses. Every public event also gets its own shareable page on eaves.be.'],
        ],
        step2: ['Choose Host', 'Select Host during onboarding or add the role later. You can start creating public events right away.'],
        step3: ['Create your first event', 'Add your event details, build the lineup, invite artists and publish when everything is ready.'],
        faq: [
          ['How do I become a host?', 'Choose Host during onboarding or add the role later in the app. The role is available right away, so you can start creating public events immediately.'],
          ['Can I also create private events?', 'Yes. Everyone can create private events and invite friends, for example for pre-drinks or a house party. The Host role gives you the tools to create public events.'],
          ['Can I add artists who aren’t on Eaves?', 'Yes. You can add guest artists without an Eaves account, as well as registered artists and curated profiles. Eaves also flags overlapping time slots.'],
          ['How do venue requests work?', 'Choose a venue on Eaves and send a request for your event. The venue owner can approve or decline it in the app. You’ll be notified of their decision.'],
          ['Do you sell tickets?', 'No. You can add an external ticket link to your event. Ticket sales are handled by the platform you link to.'],
          ['How do people discover my events?', 'Public events can appear in people’s feeds and search results, including saved searches that match the event. Each public event also gets its own shareable page on eaves.be.'],
          'free',
          'multiRole',
        ],
        finalTitle: 'Got an event in mind?',
        finalText: 'Bring your event, lineup and artists together on Eaves. Create your first event for free.',
      },
      artists: {
        slug: 'for-artists',
        title: 'For artists: get discovered and join lineups in Leuven | Eaves',
        desc: 'Create your artist profile, share your music and join event lineups on Eaves. Open to every artist in Leuven, completely free.',
        pill: 'For artists',
        h1: ['Get your name on the', 'lineup.'],
        lead: 'Whether you’re a DJ, musician, producer or part of a band, Eaves gives you a place in Leuven’s music scene. Create your artist profile, share your sound and receive lineup invitations from hosts.',
        blurb: 'Build your profile, share your music and join lineups.',
        shot: ['phone-lineup-720.webp', 'Eaves lineup with stages, artists and set times'],
        rolesShot: ['phone-role-artist-720.webp', 'Eaves role selection with the Artist role selected'],
        cards: [
          ['Open to every artist', 'Just getting started or already playing shows? Every artist is welcome on Eaves. Choose the Artist role and create your profile for free. No following or approval needed.'],
          ['Your music, your profile', 'Show people who you are. Add your artist name, bio, genres, social links and booking contact. Feature tracks from Spotify, SoundCloud or YouTube so people can discover your sound.'],
          ['Join event lineups', 'Hosts can invite you to perform at their events, with a specific stage and time slot. Accept or decline invitations in the app and keep track of your upcoming performances.'],
          ['Build your following', 'Let people discover and follow you. Your profile brings together your music, upcoming and past performances, followers and ratings.'],
        ],
        step2: ['Choose Artist', 'Select Artist during onboarding or add the role later. You get access right away.'],
        step3: ['Make it yours', 'Your artist profile is created automatically. Add your bio, genres, music, social links and booking contact.'],
        faq: [
          ['Can anyone create an artist profile?', 'Yes. Eaves is open to every artist, from first-time DJs and bedroom producers to established musicians and bands. You don’t need a following or approval to get started.'],
          ['How do I get invited to a lineup?', 'Hosts can add you to an event lineup and send you an invitation with a stage and time slot. You can accept or decline it in the app.'],
          ['What can I add to my artist profile?', 'Your artist name, bio, genres, social links, booking contact and featured tracks from Spotify, SoundCloud or YouTube.'],
          ['Who can see my artist profile?', 'Artist profiles are public. Visitors can see your profile, upcoming and past performances, followers and ratings.'],
          'free',
          'multiRole',
        ],
        finalTitle: 'Your next show starts here.',
        finalText: 'Create your artist profile, share your sound and become part of Leuven’s music scene. It’s free to join.',
      },
      venues: {
        slug: 'for-venues',
        title: 'For venues in Leuven: showcase and manage event requests | Eaves',
        desc: 'Put your venue on the map. Showcase your space, connect with local hosts and manage event requests on Eaves. Free for venues in Leuven.',
        pill: 'For venues',
        h1: ['Put your', 'venue on the map.'],
        lead: 'Give people a place to discover your venue and connect with the local music scene. Showcase your space, keep track of events and decide which hosts can organise events at your venue.',
        blurb: 'Showcase your space and manage host requests.',
        shot: ['phone-following-720.webp', 'Eaves feed with events from friends and from artists, venues and hosts you follow'],
        rolesShot: ['phone-role-venue-720.webp', 'Eaves role selection with the Venue Owner role selected'],
        cards: [
          ['Showcase your venue', 'Create a public venue profile with your location, capacity, opening hours, photos and socials. Give visitors a better idea of your space before they arrive.'],
          ['Stay in control of requests', 'Hosts can request your venue for their events. Review each request and approve or decline it in the app. You stay in control of what gets organised at your venue.'],
          ['Keep track of events', 'See upcoming and past events, as well as open requests for your venues. Your dashboard also gives you access to venue statistics.'],
          ['Connect with the scene', 'Make your venue easier to discover. People can explore your location, follow your venue and find the events taking place there.'],
        ],
        step2: ['Apply as a venue owner', 'Choose Venue Owner in the app and submit your application. Our team reviews venue owner requests before approval.'],
        step3: ['Verify your venue', 'Provide your company name, Belgian company number (KBO/BCE), business address and any supporting documents requested during verification.'],
        faq: [
          ['How do I register my venue?', 'Download Eaves, create an account and apply for the Venue Owner role. Our team reviews applications before granting access.'],
          ['What information do I need for verification?', 'You’ll need your company name, Belgian company number (KBO/BCE), business address and any supporting documents we request. These details are used to verify your venue.'],
          ['How do host requests work?', 'Hosts can request your venue for an event. You can review each request and approve or decline it in the app. When you decline, you provide a reason so the host knows your decision.'],
          ['What can I manage in the app?', 'Your dashboard gives you an overview of upcoming and past events, open requests and statistics for your venues. You can also manage your public venue profile.'],
          ['Does it cost anything?', 'No. Eaves is free for venue owners, just like every other role on the platform.'],
        ],
        finalTitle: 'Make your venue part of the scene.',
        finalText: 'Showcase your space, connect with local hosts and show what’s on at your venue. Apply for the Venue Owner role on Eaves.',
      },
    },
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pageUrl = (lang, role) => `${ORIGIN}/${lang.outDir}${role.slug}/`;

function renderPage(langKey, roleKey) {
  const L = LANGS[langKey];
  const ui = L.ui;
  const r = L.roles[roleKey];
  const home = `/${L.outDir}`;

  // hreflang links only make sense once the page exists in more than one language.
  const alternates = Object.values(LANGS).filter((l) => l.roles[roleKey]);
  const hreflang =
    alternates.length > 1
      ? alternates.map((l) => `<link rel="alternate" hreflang="${l.htmlLang}" href="${pageUrl(l, l.roles[roleKey])}">`).join('\n') +
        `\n<link rel="alternate" hreflang="x-default" href="${pageUrl(alternates[0], alternates[0].roles[roleKey])}">`
      : '';

  const badges = `<div class="row badges">
      <a href="${APP_STORE_URL}"><img src="/assets/store-badge-apple.svg" alt="${esc(ui.appStoreAlt)}" height="46"></a>
      <a href="${PLAY_URL}"><img src="/assets/store-badge-google.svg" alt="${esc(ui.playAlt)}" height="46"></a>
    </div>`;

  const cards = r.cards.map(([h, p]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('\n    ');
  const steps = [ui.step1, r.step2, r.step3]
    .map(([h, p]) => `<li><div><strong>${esc(h)}</strong>${esc(p)}</div></li>`)
    .join('\n      ');
  // A string in r.faq is a key into the shared FAQ items.
  const faqItems = r.faq.map((item) => (typeof item === 'string' ? ui.sharedFaq[item] : item));
  const faq = faqItems.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n  ');
  const more = Object.entries(L.roles)
    .filter(([k]) => k !== roleKey)
    .map(([, o]) => `<a class="card" href="${home}${o.slug}/"><h3>${esc(o.pill)}</h3><p>${esc(o.blurb)}</p></a>`)
    .join('\n    ');
  const nav = ui.nav.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join('');
  const foot = ui.footer.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join('');

  return `<!DOCTYPE html>
<html lang="${L.htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.title)}</title>
<meta name="description" content="${esc(r.desc)}">
<meta name="theme-color" content="#121212">
<meta name="apple-itunes-app" content="app-id=6794866218">
<link rel="canonical" href="${pageUrl(L, r)}">
${hreflang}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(r.title)}">
<meta property="og:description" content="${esc(r.desc)}">
<meta property="og:url" content="${pageUrl(L, r)}">
<meta property="og:image" content="${ORIGIN}/assets/scene-banner.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/assets/icon.png">
<link rel="apple-touch-icon" href="/assets/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css?v=8">
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="${home}"><img src="/assets/icon.png" alt="" width="34" height="34">Eaves</a>
  <nav class="nav" aria-label="Main">${nav}</nav>
  <a class="btn sm" href="/app?from=${r.slug}">${esc(ui.download)}</a>
</div></header>

<main>
<section class="hero"><div class="wrap">
  <div>
    <span class="pill">${esc(r.pill)}</span>
    <h1 class="rp">${esc(r.h1[0])}<br><span class="red">${esc(r.h1[1])}</span></h1>
    <p class="lead">${esc(r.lead)}</p>
    ${badges}
    <div class="qr"><img src="/assets/qr-app.svg?v=6" alt="${esc(ui.qrAlt)}" width="220" height="220"><span>${esc(ui.qr)}</span></div>
  </div>
  <div class="device"><img src="/assets/${r.shot[0]}" width="720" height="1360" alt="${esc(r.shot[1])}" fetchpriority="high"></div>
</div></section>

<section class="features"><div class="wrap">
  <h2>${esc(ui.doTitle)}</h2>
  <div class="extras">
    ${cards}
  </div>
</div></section>

<section class="creators"><div class="wrap">
  <div>
    <h2>${esc(ui.startTitle)}</h2>
    <ol class="rp-steps">
      ${steps}
    </ol>
  </div>
  <div class="device"><img src="/assets/${r.rolesShot[0]}" width="720" height="1387" loading="lazy" alt="${esc(r.rolesShot[1])}"></div>
</div></section>

<section class="faq"><div class="wrap">
  <h2>${esc(ui.faqTitle)}</h2>
  ${faq}
</div></section>

<section class="more"><div class="wrap">
  <h2>${esc(ui.moreTitle)}</h2>
  <div class="extras">
    ${more}
  </div>
</div></section>

<section class="final">
  <h2>${esc(r.finalTitle ?? ui.finalTitle)}</h2>
  <p>${esc(r.finalText ?? ui.finalText)}</p>
  ${badges}
</section>
</main>

<footer class="foot"><div class="wrap">
  <nav aria-label="Footer">${foot}</nav>
  <a href="mailto:help@eaves.be">help@eaves.be</a>
</div></footer>
</body>
</html>
`;
}

for (const [langKey, lang] of Object.entries(LANGS)) {
  for (const roleKey of Object.keys(lang.roles)) {
    const file = path.join(lang.outDir, lang.roles[roleKey].slug, 'index.html');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, renderPage(langKey, roleKey), 'utf8');
    console.log(`wrote ${file}`);
  }
}