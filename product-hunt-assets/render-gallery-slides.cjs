const sharp = require('/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const WIDTH = 1270;
const HEIGHT = 760;

const paths = {
  creator: '/Users/bytedance/Projects/OpenWorkBuddy2/product-hunt-assets/deepdeck-creator-live-english-clean.png',
  hackerNews: '/private/tmp/deepdeck-ph-assets.WtYixH/hackernews-reader/docs/images/deepdeck-hackernews-reader.jpg',
  videoSherlock: '/private/tmp/deepdeck-ph-assets.WtYixH/video-sherlock/docs/images/video-sherlock-highlight-analysis.jpg',
  icon: '/Users/bytedance/Projects/OpenWorkBuddy2/branding/app-icon.png',
  outputDir: '/Users/bytedance/Projects/OpenWorkBuddy2/product-hunt-assets',
};

const slides = [
  {
    key: 'creator',
    eyebrow: 'VIBE CODING',
    title: 'The app adapts to you.',
    subtitle: 'Describe the change. The agent edits local source, rebuilds, and hot-reloads the running App.',
    screenshot: paths.creator,
    position: 'north',
  },
  {
    key: 'hackernews-reader',
    eyebrow: 'HACKER NEWS READER',
    title: 'Read the discussion. Ask the agent.',
    subtitle: 'Feeds, search, threads, Explain, and Summarize share one App Workspace and Session.',
    screenshot: paths.hackerNews,
    position: 'north',
  },
  {
    key: 'video-sherlock',
    eyebrow: 'VIDEO SHERLOCK',
    title: 'Long-running work, visible.',
    subtitle: 'Dispatch an investigation, watch progress, and inspect evidence-backed artifacts in the App.',
    screenshot: paths.videoSherlock,
    position: 'north',
  },
];

function xml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function roundedImage(path, width, height, radius, position) {
  const mask = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/>` +
    '</svg>',
  );

  return sharp(path)
    .resize(width, height, { fit: 'cover', position })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function renderSlide(slide, index) {
  const [icon, screenshot] = await Promise.all([
    sharp(paths.icon).resize(42, 42).png().toBuffer(),
    roundedImage(slide.screenshot, 1150, 474, 17, slide.position),
  ]);

  const base = Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fbfcff"/>
          <stop offset="0.58" stop-color="#f7f8fc"/>
          <stop offset="1" stop-color="#f1f4fb"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#1b2a4a" flood-opacity="0.16"/>
        </filter>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
      <circle cx="1135" cy="-45" r="260" fill="#dfe8ff" opacity="0.46"/>
      <circle cx="1240" cy="84" r="145" fill="#eef2ff" opacity="0.84"/>

      <text x="60" y="102" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="14" font-weight="700" letter-spacing="2.3" fill="#315be8">${xml(slide.eyebrow)}</text>
      <text x="60" y="159" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="45" font-weight="650" letter-spacing="-1.6" fill="#111827">${xml(slide.title)}</text>
      <text x="60" y="198" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="20" font-weight="430" letter-spacing="-0.25" fill="#667085">${xml(slide.subtitle)}</text>

      <rect x="48" y="236" width="1174" height="498" rx="25" fill="#ffffff" filter="url(#shadow)"/>
      <rect x="59" y="247" width="1152" height="476" rx="18" fill="#e5e9f2"/>
      <rect x="982" y="44" width="220" height="60" rx="18" fill="#ffffff" opacity="0.88"/>
      <text x="1055" y="81" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="22" font-weight="700" letter-spacing="-0.5" fill="#111111">DeepDeck</text>
    </svg>
  `);

  const output = `${paths.outputDir}/deepdeck-gallery-${index + 2}-${slide.key}-v3.png`;
  await sharp(base)
    .composite([
      { input: screenshot, left: 60, top: 248 },
      { input: icon, left: 998, top: 53 },
    ])
    .png()
    .toFile(output);

  return output;
}

(async () => {
  const requestedKey = process.argv[2];
  const selectedSlides = requestedKey
    ? slides.filter((slide) => slide.key === requestedKey)
    : slides;
  const outputs = [];
  for (const slide of selectedSlides) {
    outputs.push(await renderSlide(slide, slides.indexOf(slide)));
  }
  console.log(JSON.stringify(outputs, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
