const sharp = require('/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const canvas = {
  width: 1622,
  height: 970,
};

const paths = {
  reference: '/var/folders/_x/yrngpl111kvcq8vszzdy7ybw0000gn/T/codex-clipboard-6c9456c4-54c7-4b5e-88e6-322fe55b1295.png',
  creator: '/Users/bytedance/Projects/OpenWorkBuddy2/product-hunt-assets/deepdeck-creator-live-english-clean.png',
  hackerNews: '/private/tmp/deepdeck-ph-assets.WtYixH/hackernews-reader/docs/images/deepdeck-hackernews-reader.jpg',
  videoSherlock: '/private/tmp/deepdeck-ph-assets.WtYixH/video-sherlock/docs/images/video-sherlock-highlight-analysis.jpg',
  appIcon: '/Users/bytedance/Projects/OpenWorkBuddy2/branding/app-icon.png',
  wordmark: '/Users/bytedance/Projects/OpenWorkBuddy2/branding/wordmark.svg',
  original: '/Users/bytedance/Projects/OpenWorkBuddy2/product-hunt-assets/deepdeck-product-hunt-cover-v11-original.png',
  output: '/Users/bytedance/Projects/OpenWorkBuddy2/product-hunt-assets/deepdeck-product-hunt-cover-v11.png',
};

async function roundedScreenshot(path, width, height, radius, position = 'centre') {
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

async function render() {
  const [creator, hackerNews, videoSherlock, appIcon, fullWordmark] = await Promise.all([
    roundedScreenshot(paths.creator, 826, 739, 17, 'west'),
    roundedScreenshot(paths.hackerNews, 704, 371, 14, 'north'),
    roundedScreenshot(paths.videoSherlock, 704, 312, 14, 'centre'),
    sharp(paths.appIcon).resize(84, 84).png().toBuffer(),
    sharp(paths.wordmark, { density: 384 }).resize({ width: 360 }).png().toBuffer(),
  ]);

  const wordmarkText = await sharp(fullWordmark)
    .extract({ left: 80, top: 0, width: 280, height: 77 })
    .png()
    .toBuffer();

  const overlay = Buffer.from(`
    <svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="18" y="26" width="410" height="112" rx="18" fill="#fbfaf8"/>
      <rect x="900" y="112" width="700" height="78" fill="#fbfaf8"/>
      <text x="1585" y="170"
            text-anchor="end"
            font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="39"
            font-weight="500"
            letter-spacing="-0.8">
        <tspan fill="#566170">From intent to a</tspan><tspan dx="10" fill="#315BE8">live app.</tspan>
      </text>

      <g fill="none" stroke="#3c75f5" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M720 677 H798 C822 677 835 661 835 637 V573 C835 554 852 544 884 544"/>
        <path d="M798 677 C822 677 835 693 835 717 V739 C835 758 852 768 884 768"/>
      </g>
      <g fill="#3c75f5" stroke="#ffffff" stroke-width="3">
        <circle cx="720" cy="677" r="8"/>
        <circle cx="884" cy="544" r="7"/>
        <circle cx="884" cy="768" r="7"/>
      </g>
    </svg>
  `);

  await sharp(paths.reference)
    .composite([
      { input: creator, left: 33, top: 186 },
      { input: hackerNews, left: 886, top: 218 },
      { input: videoSherlock, left: 886, top: 611 },
      { input: overlay, left: 0, top: 0 },
      { input: appIcon, left: 32, top: 42 },
      { input: wordmarkText, left: 128, top: 46 },
    ])
    .png()
    .toFile(paths.original);

  const info = await sharp(paths.original)
    .resize(1270, 760, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(paths.output);

  console.log(JSON.stringify(info));
}

render().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
