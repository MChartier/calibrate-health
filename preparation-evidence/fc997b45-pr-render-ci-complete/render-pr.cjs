const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require(process.argv[2]);
const input = process.argv[3];
const output = process.argv[4];
const raw = fs.readFileSync(input, 'utf8');
const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const inline = (s) => escape(s).replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span foreground="#0969da" underline="single">$1</span>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<tt>$1</tt>');
const width = 1440;
const margin = 48;
const contentWidth = width - margin * 2;
const layers = [];
let y = 38;
async function text(text, x, top, w, font = 'Segoe UI 19') {
  const { data, info } = await sharp({ text: { text, font, width: w, rgba: true, wrap: 'word-char', spacing: 5 } }).png().toBuffer({ resolveWithObject: true });
  layers.push({ input: data, left: x, top });
  return info.height;
}
async function main() {
  y += await text('<b>LOCAL RENDER OF API PR BODY</b> — not the private GitHub page', margin, y, contentWidth, 'Segoe UI 17') + 28;
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|\s*:?-+/.test(lines[i])) rows.push(lines[i].slice(1, -1).split('|').map(s => s.trim()));
        i++;
      }
      const cols = rows[0].length;
      const cw = Math.floor(contentWidth / cols);
      for (let r = 0; r < rows.length; r++) {
        const cells = [];
        let rh = 0;
        for (let c = 0; c < cols; c++) {
          const result = await sharp({ text: { text: (r ? '' : '<b>') + inline(rows[r][c]) + (r ? '' : '</b>'), font: 'Segoe UI 17', width: cw - 28, rgba: true, wrap: 'word-char', spacing: 4 } }).png().toBuffer({ resolveWithObject: true });
          cells.push(result); rh = Math.max(rh, result.info.height + 28);
        }
        const bg = Buffer.from(`<svg width="${contentWidth}" height="${rh}"><rect width="100%" height="100%" fill="${r % 2 ? '#ffffff' : '#eef2f6'}" stroke="#cbd2d9"/></svg>`);
        layers.push({ input: bg, left: margin, top: y });
        cells.forEach((cell, c) => layers.push({ input: cell.data, left: margin + c * cw + 14, top: y + 14 }));
        y += rh;
      }
      y += 24; continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      y += await text(`<b>${inline(heading[2])}</b>`, margin, y, contentWidth, heading[1].length <= 2 ? 'Segoe UI 27' : 'Segoe UI 22') + 20;
      i++; continue;
    }
    const parts = [line]; i++;
    if (!line.startsWith('- ')) {
      while (i < lines.length && lines[i].trim() && !/^(#|\||- )/.test(lines[i])) parts.push(lines[i++]);
    }
    y += await text(inline(parts.join(' ')), margin, y, contentWidth) + 22;
  }
  fs.mkdirSync(output, { recursive: true });
  const whole = await sharp({ create: { width, height: y + 40, channels: 4, background: '#ffffff' } }).composite(layers).png().toBuffer();
  fs.writeFileSync(path.join(output, 'full.png'), whole);
  const pages = [];
  for (let top = 0, page = 1; top < y + 40; top += 1500, page++) {
    const name = `page-${page}.png`;
    await sharp(whole).extract({ left: 0, top, width, height: Math.min(1500, y + 40 - top) }).png().toFile(path.join(output, name));
    pages.push(name);
  }
  const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ bodySha256: sha(Buffer.from(raw)), rendererSha256: sha(fs.readFileSync(__filename)), renderer: 'Local Sharp/Pango document renderer; headings, paragraphs, lists and tables; not GitHub UI', sharpVersion: sharp.versions.sharp, width, height: y + 40, images: ['full.png', ...pages].map(name => ({ name, sha256: sha(fs.readFileSync(path.join(output, name))) })) }, null, 2));
  console.log(JSON.stringify({ width, height: y + 40, pages }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
