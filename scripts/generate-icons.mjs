// Renders the app icons in public/icons from the logo artwork (uses the Playwright Chromium).
// Run after changing the logo: `npm run icons`.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const OUT = path.resolve('public/icons');
fs.mkdirSync(OUT, { recursive: true });

const glyph = `
  <g transform="translate(0 -2.5)">
  <polygon points="23,15 41,25 50,30 32,20" fill="#ffffff" opacity="0.72"/>
  <polygon points="14,30 32,40 32,54 14,44" fill="#ffffff" opacity="0.6"/>
  <polygon points="32,54 50,44 50,30 41,25 32,40" fill="#ffffff" opacity="0.38"/>
  <polygon points="14,30 32,40 41,25 23,15" fill="#ffffff" opacity="0.96"/>
  <polygon points="19.4,39 23.9,41.5 23.9,49.5 19.4,47" fill="#4743c6" opacity="0.55"/>
  <polygon points="40.1,39.5 45.5,36.5 45.5,41.5 40.1,44.5" fill="#ffd27a"/>
</g>`;

const gradient = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#6d6be8"/><stop offset="100%" stop-color="#4743c6"/></linearGradient></defs>`;

const icons = {
  // Rounded tile with transparent corners (browsers, favicon).
  rounded: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${gradient}<rect width="64" height="64" rx="15" fill="url(#g)"/>${glyph}</svg>`,
  // Full-bleed square: iOS rounds the corners itself.
  square: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${gradient}<rect width="64" height="64" fill="url(#g)"/>${glyph}</svg>`,
  // Android maskable: art inside the 80% safe zone.
  maskable: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${gradient}<rect width="64" height="64" fill="url(#g)"/><g transform="translate(9.6 9.6) scale(0.7)">${glyph}</g></svg>`,
  // Monochrome notification badge.
  badge: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="#ffffff" transform="translate(0 -2.5)"><polygon points="14,30 23,15 41,25 50,30 50,44 32,54 14,44"/></g></svg>`,
};

fs.writeFileSync(path.join(OUT, 'favicon.svg'), icons.rounded);

const targets = [
  ['icon-192.png', icons.rounded, 192, true],
  ['icon-512.png', icons.rounded, 512, true],
  ['icon-maskable-512.png', icons.maskable, 512, false],
  ['apple-touch-icon.png', icons.square, 180, false],
  ['badge-96.png', icons.badge, 96, true],
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();
for (const [name, svg, size, transparent] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: path.join(OUT, name), omitBackground: transparent });
  console.log(`wrote public/icons/${name}`);
}
await browser.close();
