const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../../../frontend/node_modules/sharp');

const ROOT = __dirname;
const OUTPUT = path.join(ROOT, 'play-console');
const SCREENSHOTS = path.join(OUTPUT, 'phone-screenshots');
const ICON = path.join(__dirname, '../../assets/icon.png');
const FEATURE = path.join(__dirname, 'feature-graphic.png');

const width = 1080;
const height = 1920;

const colors = {
  background: '#07070A',
  surface: '#11151e',
  surfaceStrong: '#191f2b',
  text: '#ffffff',
  muted: '#94a3b8',
  soft: '#cbd5e1',
  accent: '#c84a5f',
  blue: '#8ed3ff',
  gold: '#fbbf24',
};

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function text(x, y, value, size, options = {}) {
  const {
    fill = colors.text,
    weight = 700,
    anchor = 'start',
    opacity = 1,
    letterSpacing = 0,
  } = options;
  return `<text x="${x}" y="${y}" fill="${fill}" fill-opacity="${opacity}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${escapeXml(value)}</text>`;
}

function lineBlock(x, y, lines, size, lineHeight, options = {}) {
  return lines.map((line, index) => text(x, y + index * lineHeight, line, size, options)).join('');
}

function roundedRect(x, y, w, h, radius, fill, stroke = 'none', strokeWidth = 0, opacity = 1) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function starPath(cx, cy, outer = 18, inner = 8, fill = colors.gold, opacity = 1) {
  const points = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`);
  }
  return `<polygon points="${points.join(' ')}" fill="${fill}" fill-opacity="${opacity}"/>`;
}

function searchIcon(x, y, color = colors.muted) {
  return `<circle cx="${x}" cy="${y}" r="12" fill="none" stroke="${color}" stroke-width="4"/><path d="M${x + 9} ${y + 9} L${x + 21} ${y + 21}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
}

function navIcon(x, y, kind, active) {
  const color = active ? colors.blue : '#64748b';
  const stroke = `stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  if (kind === 'home') return `<path d="M${x - 18} ${y} L${x} ${y - 16} L${x + 18} ${y} V${y + 20} H${x + 6} V${y + 5} H${x - 6} V${y + 20} H${x - 18} Z" ${stroke}/>`;
  if (kind === 'search') return searchIcon(x - 4, y - 3, color);
  if (kind === 'social') return `<circle cx="${x - 9}" cy="${y - 7}" r="8" ${stroke}/><circle cx="${x + 11}" cy="${y - 5}" r="7" ${stroke}/><path d="M${x - 24} ${y + 20} Q${x - 9} ${y + 4} ${x + 6} ${y + 20}" ${stroke}/><path d="M${x + 1} ${y + 18} Q${x + 12} ${y + 7} ${x + 25} ${y + 19}" ${stroke}/>`;
  if (kind === 'message') return `<path d="M${x - 22} ${y - 15} H${x + 22} V${y + 13} H${x + 2} L${x - 11} ${y + 24} V${y + 13} H${x - 22} Z" ${stroke}/>`;
  return `<circle cx="${x}" cy="${y - 8}" r="11" ${stroke}/><path d="M${x - 22} ${y + 23} Q${x} ${y + 2} ${x + 22} ${y + 23}" ${stroke}/>`;
}

function bottomNav(active) {
  const items = [
    ['home', 'Accueil'],
    ['search', 'Recherche'],
    ['social', 'Social'],
    ['message', 'Messages'],
    ['profile', 'Profil'],
  ];
  return `${roundedRect(99, 1690, 882, 132, 36, '#0d1119', 'rgba(255,255,255,0.08)', 2)}${items.map(([kind, label], index) => {
    const x = 178 + index * 181;
    const selected = kind === active;
    return `${navIcon(x, 1738, kind, selected)}${text(x, 1789, label, 16, { fill: selected ? colors.blue : '#64748b', anchor: 'middle', weight: selected ? 800 : 650 })}`;
  }).join('')}`;
}

function appChrome(active, body, title = '') {
  return `
    <g filter="url(#panelShadow)">
      ${roundedRect(70, 500, 940, 1368, 68, '#07070A', 'rgba(255,255,255,0.13)', 3)}
    </g>
    ${text(120, 558, '9:41', 20, { weight: 800, fill: colors.soft })}
    ${roundedRect(858, 538, 34, 16, 8, colors.soft)}
    ${roundedRect(902, 538, 30, 16, 8, colors.soft, 'none', 0, 0.72)}
    ${roundedRect(944, 536, 32, 20, 6, 'none', colors.soft, 3)}
    ${roundedRect(977, 542, 4, 8, 2, colors.soft)}
    ${title ? text(112, 633, title, 34, { weight: 850 }) : ''}
    ${body}
    ${bottomNav(active)}
  `;
}

function posterArt(x, y, w, h, variant, label = '') {
  const radius = 26;
  const defs = [
    ['#f59e0b', '#7c2d12', '#0f172a'],
    ['#38bdf8', '#1d4ed8', '#111827'],
    ['#fb7185', '#7e22ce', '#111827'],
    ['#a3e635', '#047857', '#082f49'],
    ['#f472b6', '#be123c', '#1e1b4b'],
    ['#c084fc', '#4338ca', '#111827'],
  ][variant % 6];
  const id = `poster-${variant}-${Math.round(x)}-${Math.round(y)}`.replaceAll('.', '-');
  const scene = variant % 3 === 0
    ? `<circle cx="${x + w * 0.72}" cy="${y + h * 0.24}" r="${w * 0.18}" fill="#fff7d6" fill-opacity="0.78"/><path d="M${x} ${y + h * 0.72} L${x + w * 0.32} ${y + h * 0.45} L${x + w * 0.52} ${y + h * 0.66} L${x + w * 0.75} ${y + h * 0.38} L${x + w} ${y + h * 0.63} V${y + h} H${x} Z" fill="#05070d" fill-opacity="0.78"/>`
    : variant % 3 === 1
      ? `<circle cx="${x + w / 2}" cy="${y + h * 0.38}" r="${w * 0.27}" fill="none" stroke="#f8fafc" stroke-opacity="0.5" stroke-width="5"/><circle cx="${x + w / 2}" cy="${y + h * 0.38}" r="${w * 0.08}" fill="#f8fafc" fill-opacity="0.65"/><path d="M${x + w * 0.1} ${y + h * 0.78} Q${x + w * 0.5} ${y + h * 0.55} ${x + w * 0.9} ${y + h * 0.78} V${y + h} H${x + w * 0.1} Z" fill="#05070d" fill-opacity="0.7"/>`
      : `<path d="M${x + w * 0.48} ${y + h * 0.14} C${x + w * 0.24} ${y + h * 0.34}, ${x + w * 0.2} ${y + h * 0.62}, ${x + w * 0.49} ${y + h * 0.83} C${x + w * 0.82} ${y + h * 0.6}, ${x + w * 0.73} ${y + h * 0.32}, ${x + w * 0.48} ${y + h * 0.14} Z" fill="#fff" fill-opacity="0.18"/><circle cx="${x + w * 0.48}" cy="${y + h * 0.43}" r="${w * 0.14}" fill="#fff" fill-opacity="0.2"/>`;
  return `
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${defs[0]}"/><stop offset="0.54" stop-color="${defs[1]}"/><stop offset="1" stop-color="${defs[2]}"/></linearGradient></defs>
    <g clip-path="url(#clip-${id})">
      <clipPath id="clip-${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}"/></clipPath>
      ${roundedRect(x, y, w, h, radius, `url(#${id})`)}
      ${scene}
      <rect x="${x}" y="${y + h * 0.54}" width="${w}" height="${h * 0.46}" fill="url(#fade)"/>
      ${label ? text(x + 18, y + h - 24, label, Math.max(18, Math.round(w * 0.075)), { weight: 900, letterSpacing: 0.2 }) : ''}
    </g>
  `;
}

function marketingShell({ number, eyebrow, headline, description, active, appTitle, body }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#07070A"/><stop offset="0.5" stop-color="#101827"/><stop offset="1" stop-color="#16090d"/></linearGradient>
      <linearGradient id="headline" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe7a8"/><stop offset="0.56" stop-color="#ff9a5a"/><stop offset="1" stop-color="#e54b59"/></linearGradient>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#020617" stop-opacity="0"/><stop offset="1" stop-color="#020617" stop-opacity="0.98"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="55"/></filter>
      <filter id="panelShadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#000" flood-opacity="0.48"/></filter>
    </defs>
    <rect width="1080" height="1920" fill="url(#background)"/>
    <circle cx="960" cy="170" r="230" fill="#c84a5f" fill-opacity="0.17" filter="url(#glow)"/>
    <circle cx="90" cy="520" r="260" fill="#38bdf8" fill-opacity="0.11" filter="url(#glow)"/>
    ${roundedRect(72, 68, 58, 58, 16, '#11151e', 'rgba(255,255,255,0.13)', 2)}
    <circle cx="101" cy="97" r="17" fill="none" stroke="#ffe7a8" stroke-width="7"/><path d="M112 109 L123 120" stroke="#ffe7a8" stroke-width="7" stroke-linecap="round"/><circle cx="94" cy="91" r="3.5" fill="#ff9a5a"/>
    ${text(150, 111, 'Qulte', 36, { weight: 900 })}
    ${text(1008, 108, String(number).padStart(2, '0'), 23, { fill: colors.muted, weight: 800, anchor: 'end', letterSpacing: 3 })}
    ${text(72, 190, eyebrow.toUpperCase(), 20, { fill: colors.blue, weight: 850, letterSpacing: 3 })}
    ${lineBlock(72, 270, headline, 64, 71, { fill: 'url(#headline)', weight: 900, letterSpacing: -1.4 })}
    ${text(74, 432, description, 27, { fill: colors.soft, weight: 550 })}
    ${appChrome(active, body, appTitle)}
  </svg>`;
}

function recommendationsScreen() {
  const body = `
    ${roundedRect(110, 602, 56, 56, 18, colors.surface, 'rgba(255,255,255,0.11)', 2)}
    ${text(138, 641, '?', 29, { anchor: 'middle', weight: 900 })}
    ${roundedRect(375, 602, 330, 56, 22, colors.surface, 'rgba(255,255,255,0.11)', 2)}
    ${roundedRect(381, 608, 155, 44, 17, colors.accent)}
    ${text(458, 638, 'Films', 20, { anchor: 'middle', weight: 900 })}
    ${text(620, 638, 'Séries', 20, { anchor: 'middle', fill: colors.muted, weight: 800 })}
    ${roundedRect(914, 602, 56, 56, 18, colors.surface, 'rgba(255,255,255,0.11)', 2)}
    <circle cx="936" cy="628" r="7" fill="none" stroke="#fff" stroke-width="3"/><circle cx="955" cy="628" r="7" fill="none" stroke="#fff" stroke-width="3"/><path d="M925 646 Q936 635 947 646 M944 646 Q955 635 966 646" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${posterArt(178, 692, 724, 845, 0)}
    ${roundedRect(214, 1376, 112, 48, 24, 'rgba(15,23,42,0.7)')}
    ${starPath(239, 1400, 11, 5)}
    ${text(268, 1408, '8.4', 20, { fill: '#fde68a', weight: 900 })}
    ${text(214, 1476, 'LES NUITS DE MARS', 36, { weight: 900, letterSpacing: -0.8 })}
    ${roundedRect(328, 1045, 424, 66, 33, 'rgba(37,99,235,0.94)', 'rgba(191,219,254,0.6)', 2)}
    <path d="M365 1065 H389 V1093 L377 1085 L365 1093 Z" fill="none" stroke="#eff6ff" stroke-width="3"/>
    ${text(414, 1088, 'À REGARDER PLUS TARD', 22, { fill: '#eff6ff', weight: 900, letterSpacing: 1 })}
    ${[0, 1, 2, 3, 4].map((index) => starPath(402 + index * 70, 1610, 24, 11)).join('')}
  `;
  return marketingShell({
    number: 1,
    eyebrow: 'Recommandations personnalisées',
    headline: ['Trouvez votre prochain', 'coup de cœur'],
    description: 'Swipez, notez : Qulte apprend vos goûts.',
    active: 'home',
    body,
  });
}

function playlistsScreen() {
  const posters = [
    [135, 850, 250, 350, 1, 'ORBITAL'],
    [415, 850, 250, 350, 2, 'MINUIT'],
    [695, 850, 250, 350, 3, 'NORD'],
    [135, 1240, 250, 350, 4, 'ÉCLATS'],
    [415, 1240, 250, 350, 5, 'SOLSTICE'],
    [695, 1240, 250, 350, 0, 'HORIZON'],
  ];
  const body = `
    ${text(112, 635, 'À regarder plus tard', 39, { weight: 900 })}
    ${text(112, 674, '128 films et séries', 21, { fill: colors.muted, weight: 650 })}
    ${roundedRect(112, 712, 856, 64, 23, colors.surface, 'rgba(255,255,255,0.09)', 2)}
    ${searchIcon(145, 744)}
    ${text(180, 752, 'Rechercher un titre', 21, { fill: colors.muted, weight: 550 })}
    ${roundedRect(112, 798, 170, 48, 20, colors.surfaceStrong, 'rgba(255,255,255,0.09)', 2)}
    ${text(197, 829, 'Trier', 19, { anchor: 'middle', weight: 800 })}
    ${roundedRect(296, 798, 194, 48, 20, colors.surfaceStrong, 'rgba(255,255,255,0.09)', 2)}
    ${text(393, 829, 'Films et séries', 19, { anchor: 'middle', weight: 800 })}
    ${roundedRect(504, 798, 208, 48, 20, 'rgba(142,211,255,0.14)', 'rgba(142,211,255,0.35)', 2)}
    ${text(608, 829, 'Mes plateformes', 19, { anchor: 'middle', fill: colors.blue, weight: 850 })}
    ${posters.map(([x, y, w, h, v, label]) => posterArt(x, y, w, h, v, label)).join('')}
  `;
  return marketingShell({
    number: 2,
    eyebrow: 'Playlists intelligentes',
    headline: ['Votre liste, toujours', 'sous contrôle'],
    description: 'Recherchez, filtrez et organisez tout facilement.',
    active: 'profile',
    body,
  });
}

function reviewCard(y, initials, name, title, copy, rating, variant, publicBadge = false) {
  return `
    ${roundedRect(112, y, 856, 350, 34, colors.surface, 'rgba(255,255,255,0.09)', 2)}
    <circle cx="162" cy="${y + 54}" r="30" fill="url(#avatarGradient)"/>
    ${text(162, y + 64, initials, 20, { anchor: 'middle', weight: 900 })}
    ${text(206, y + 50, name, 22, { weight: 850 })}
    ${text(206, y + 78, 'à l’instant', 17, { fill: colors.muted, weight: 550 })}
    ${publicBadge ? `${roundedRect(818, y + 32, 116, 38, 19, 'rgba(142,211,255,0.12)')}${text(876, y + 57, 'PUBLIC', 15, { anchor: 'middle', fill: colors.blue, weight: 900, letterSpacing: 1.2 })}` : ''}
    ${posterArt(142, y + 112, 142, 202, variant)}
    ${text(316, y + 142, title, 26, { weight: 900 })}
    ${[0, 1, 2, 3, 4].map((index) => starPath(328 + index * 38, y + 180, 13, 6, colors.gold, index < rating ? 1 : 0.2)).join('')}
    ${lineBlock(316, y + 229, copy, 20, 28, { fill: colors.soft, weight: 500 })}
    ${text(316, y + 302, '♡  24', 19, { fill: colors.muted, weight: 750 })}
    ${text(422, y + 302, '○  6 commentaires', 19, { fill: colors.muted, weight: 650 })}
  `;
}

function socialScreen() {
  const body = `
    <defs><linearGradient id="avatarGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c84a5f"/><stop offset="1" stop-color="#8ed3ff"/></linearGradient></defs>
    ${text(112, 635, 'Social', 39, { weight: 900 })}
    ${roundedRect(112, 682, 420, 58, 24, colors.surface, 'rgba(255,255,255,0.09)', 2)}
    ${roundedRect(118, 688, 198, 46, 19, colors.accent)}
    ${text(217, 718, 'Amis', 20, { anchor: 'middle', weight: 900 })}
    ${text(422, 718, 'Public', 20, { anchor: 'middle', fill: colors.muted, weight: 800 })}
    ${roundedRect(802, 682, 166, 58, 24, colors.blue)}
    ${text(885, 718, '+  Critique', 19, { anchor: 'middle', fill: '#08111f', weight: 900 })}
    ${reviewCard(778, 'LM', 'Lina M.', 'ORBITAL', ['Une mise en scène magnétique,', 'et une fin qui reste en tête.'], 5, 1)}
    ${reviewCard(1152, 'AC', 'Arthur C.', 'MINUIT', ['Un film délicat et lumineux.', 'À voir absolument au cinéma.'], 4, 2, true)}
  `;
  return marketingShell({
    number: 3,
    eyebrow: 'Cinéma social',
    headline: ['Le cinéma devient', 'une conversation'],
    description: 'Partagez vos critiques et suivez celles de vos amis.',
    active: 'social',
    body,
  });
}

function probabilityRow(y, initials, name, probability, color) {
  const widthValue = Math.round(250 * probability / 100);
  return `
    <circle cx="526" cy="${y}" r="25" fill="${color}"/>
    ${text(526, y + 6, initials, 15, { anchor: 'middle', weight: 900 })}
    ${text(564, y - 2, name, 19, { weight: 800 })}
    ${roundedRect(564, y + 13, 250, 12, 6, '#232938')}
    ${roundedRect(564, y + 13, widthValue, 12, 6, color)}
    ${text(862, y + 7, `${probability}%`, 19, { fill: colors.soft, weight: 900 })}
  `;
}

function groupScreen() {
  const body = `
    ${text(112, 635, 'Soirée de groupe', 39, { weight: 900 })}
    ${text(112, 674, 'Trouvez le film qui met tout le monde d’accord.', 20, { fill: colors.muted, weight: 550 })}
    ${roundedRect(112, 708, 856, 66, 24, colors.surface, 'rgba(255,255,255,0.09)', 2)}
    ${searchIcon(148, 741)}
    ${text(184, 749, 'Ajouter des amis', 21, { fill: colors.muted, weight: 550 })}
    ${['LM', 'AC', 'YS'].map((value, index) => `<circle cx="${152 + index * 68}" cy="816" r="27" fill="${['#c84a5f', '#2563eb', '#059669'][index]}"/>${text(152 + index * 68, 823, value, 16, { anchor: 'middle', weight: 900 })}`).join('')}
    ${roundedRect(112, 862, 550, 66, 24, colors.accent)}
    ${text(387, 903, 'Trouver des films pour nous', 21, { anchor: 'middle', weight: 900 })}
    ${roundedRect(678, 862, 290, 66, 24, colors.surfaceStrong, 'rgba(255,255,255,0.09)', 2)}
    ${text(823, 903, 'Déjà vu  ✓', 20, { anchor: 'middle', fill: colors.soft, weight: 850 })}
    ${roundedRect(112, 962, 856, 660, 38, colors.surface, 'rgba(255,255,255,0.09)', 2)}
    ${posterArt(142, 992, 320, 450, 3)}
    ${roundedRect(496, 1004, 194, 46, 23, 'rgba(16,185,129,0.14)', 'rgba(52,211,153,0.34)', 2)}
    ${text(593, 1034, '89% POUR VOUS', 17, { anchor: 'middle', fill: '#86efac', weight: 900, letterSpacing: 0.8 })}
    ${text(496, 1104, 'NORD', 34, { weight: 900 })}
    ${text(496, 1140, 'Science-fiction · 2h08', 18, { fill: colors.muted, weight: 600 })}
    ${probabilityRow(1212, 'LM', 'Lina', 94, '#c84a5f')}
    ${probabilityRow(1290, 'AC', 'Arthur', 88, '#2563eb')}
    ${probabilityRow(1368, 'YS', 'Yanis', 84, '#059669')}
    ${roundedRect(496, 1464, 410, 62, 23, colors.blue)}
    ${text(701, 1503, 'Voir la fiche', 21, { anchor: 'middle', fill: '#08111f', weight: 900 })}
  `;
  return marketingShell({
    number: 4,
    eyebrow: 'Soirées de groupe',
    headline: ['Enfin d’accord', 'sur le film'],
    description: 'Croisez les goûts de tout le groupe en quelques secondes.',
    active: 'home',
    body,
  });
}

async function writePng(name, svg) {
  const outputPath = path.join(SCREENSHOTS, name);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, quality: 100 }).toFile(outputPath);
  return outputPath;
}

async function main() {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });

  await sharp(ICON)
    .resize(512, 512, { fit: 'fill' })
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(path.join(OUTPUT, 'app-icon-512.png'));

  fs.copyFileSync(FEATURE, path.join(OUTPUT, 'feature-graphic-1024x500.png'));

  await Promise.all([
    writePng('01-recommandations.png', recommendationsScreen()),
    writePng('02-playlists.png', playlistsScreen()),
    writePng('03-social.png', socialScreen()),
    writePng('04-groupe.png', groupScreen()),
  ]);

  console.log(`Google Play assets generated in ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
