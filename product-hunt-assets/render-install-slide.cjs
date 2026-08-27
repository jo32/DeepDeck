const sharp = require('/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');

const WIDTH = 1270;
const HEIGHT = 760;
const output = '/Users/bytedance/Projects/OpenWorkBuddy2/product-hunt-assets/deepdeck-gallery-5-install-app.png';
const iconPath = '/Users/bytedance/Projects/OpenWorkBuddy2/branding/app-icon.png';

const steps = [
  ['01', 'Download DeepDeck', 'Install the latest release and\nfinish first-run setup.'],
  ['02', 'Open Apps settings', 'Go to Settings → Apps and\nfind the install control.'],
  ['03', 'Paste the source', 'Use the public Git address for\nthe App you want to add.'],
  ['04', 'Inspect and confirm', 'Review the package and build\nplan, then restart once.'],
];

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function multilineText(lines, x, y) {
  return lines.split('\n').map((line, index) => (
    `<tspan x="${x}" dy="${index === 0 ? 0 : 25}">${escapeXml(line)}</tspan>`
  )).join('');
}

async function render() {
  const icon = await sharp(iconPath).resize(42, 42).png().toBuffer();
  const cards = steps.map(([number, title, description], index) => {
    const x = 60 + index * 290;
    return `
      <rect x="${x}" y="250" width="270" height="210" rx="18" fill="#ffffff" stroke="#dfe4ef"/>
      <circle cx="${x + 34}" cy="286" r="17" fill="#edf2ff"/>
      <text x="${x + 34}" y="291" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="12" font-weight="700" fill="#315be8">${number}</text>
      <text x="${x + 22}" y="346" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="21" font-weight="650" letter-spacing="-0.45" fill="#111827">${escapeXml(title)}</text>
      <text x="${x + 22}" y="385" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="15" font-weight="430" fill="#667085">${multilineText(description, x + 22, 385)}</text>
    `;
  }).join('');

  const base = Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fbfcff"/>
          <stop offset="0.6" stop-color="#f7f8fc"/>
          <stop offset="1" stop-color="#eef2fb"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-30%" width="140%" height="180%">
          <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#1b2a4a" flood-opacity="0.11"/>
        </filter>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
      <circle cx="1135" cy="-45" r="260" fill="#dfe8ff" opacity="0.46"/>
      <circle cx="1240" cy="84" r="145" fill="#eef2ff" opacity="0.84"/>

      <text x="60" y="102" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="14" font-weight="700" letter-spacing="2.3" fill="#315be8">APP INSTALLATION</text>
      <text x="60" y="159" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="45" font-weight="650" letter-spacing="-1.6" fill="#111827">Install an app in minutes.</text>
      <text x="60" y="198" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="20" font-weight="430" letter-spacing="-0.25" fill="#667085">Choose an open-source App. DeepDeck builds only after you approve its plan.</text>

      <rect x="982" y="44" width="220" height="60" rx="18" fill="#ffffff" opacity="0.88"/>
      <text x="1055" y="81" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="22" font-weight="700" letter-spacing="-0.5" fill="#111111">DeepDeck</text>

      <g filter="url(#shadow)">${cards}</g>

      <rect x="60" y="496" width="1140" height="188" rx="22" fill="#0d111b"/>
      <text x="86" y="535" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="12" font-weight="700" letter-spacing="1.7" fill="#76809a">PASTE INTO SETTINGS → APPS</text>
      <rect x="84" y="552" width="530" height="50" rx="10" fill="#171d2a" stroke="#2b3448"/>
      <text x="103" y="574" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="11" font-weight="700" letter-spacing="0.6" fill="#7f8cab">HACKER NEWS READER</text>
      <text x="103" y="591" font-family="Menlo, Monaco, Consolas, monospace"
            font-size="12" font-weight="500" fill="#eef1f7">github.com/jo32/dsh-hackernews-reader.git</text>
      <rect x="630" y="552" width="546" height="50" rx="10" fill="#171d2a" stroke="#2b3448"/>
      <text x="649" y="574" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="11" font-weight="700" letter-spacing="0.6" fill="#7f8cab">VIDEO SHERLOCK</text>
      <text x="649" y="591" font-family="Menlo, Monaco, Consolas, monospace"
            font-size="12" font-weight="500" fill="#eef1f7">github.com/jo32/dsh-video-sherlock.git</text>
      <circle cx="94" cy="640" r="5" fill="#5bd27f"/>
      <text x="109" y="645" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="15" font-weight="500" fill="#aeb6c8">Both Apps are public, installable, and ready to vibe.</text>
      <text x="1171" y="645" text-anchor="end" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
            font-size="14" font-weight="600" fill="#7f8cab">Public source · reviewed build plan</text>
    </svg>
  `);

  await sharp(base)
    .composite([{ input: icon, left: 998, top: 53 }])
    .png()
    .toFile(output);

  console.log(output);
}

render().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
