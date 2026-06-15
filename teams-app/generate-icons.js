import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const outDir = dirname(fileURLToPath(import.meta.url));

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// color.png — 192x192, blue background, white "DT", rounded corners
function generateColor() {
  const size = 192;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Rounded blue background (radius 36 ≈ 19% of size, matches Teams icon spec)
  ctx.fillStyle = '#0073ea';
  drawRoundedRect(ctx, 0, 0, size, size, 36);
  ctx.fill();

  // White "DT" text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 82px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DT', size / 2, size / 2 + 2); // +2 for optical centering

  const buffer = canvas.toBuffer('image/png');
  const outPath = join(outDir, 'color.png');
  writeFileSync(outPath, buffer);
  console.log(`✓ color.png  (${size}x${size}) → ${outPath}`);
}

// outline.png — 32x32, transparent background, white "DT"
function generateOutline() {
  const size = 32;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Canvas is transparent by default — no fill needed

  // White "DT" text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DT', size / 2, size / 2 + 1);

  const buffer = canvas.toBuffer('image/png');
  const outPath = join(outDir, 'outline.png');
  writeFileSync(outPath, buffer);
  console.log(`✓ outline.png (${size}x${size}) → ${outPath}`);
}

generateColor();
generateOutline();
console.log('\nDone. Both icons are ready in teams-app/');
