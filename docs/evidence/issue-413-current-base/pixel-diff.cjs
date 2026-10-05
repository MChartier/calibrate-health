const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  const results = [];
  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    const images = ['before', 'after'].map(label => 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, `${label}-${width}-${theme}.png`)).toString('base64'));
    const result = await page.evaluate(async urls => {
      const images = await Promise.all(urls.map(url => new Promise(resolve => {
        const image = new Image(); image.onload = () => resolve(image); image.src = url;
      })));
      const canvas = document.createElement('canvas');
      canvas.width = images[0].width; canvas.height = images[0].height;
      const context = canvas.getContext('2d');
      const pixels = images.map(image => { context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0); return context.getImageData(0, 0, canvas.width, canvas.height).data; });
      let count = 0, minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
      for (let i = 0; i < pixels[0].length; i += 4) {
        if (![0, 1, 2, 3].some(channel => pixels[0][i + channel] !== pixels[1][i + channel])) continue;
        count++; const x = (i / 4) % canvas.width, y = Math.floor(i / 4 / canvas.width);
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      return { count, bounds: { minX, minY, maxX, maxY } };
    }, images);
    results.push({ width, theme, ...result });
  }
  fs.writeFileSync(path.join(__dirname, 'pixel-diff.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(results);
  await browser.close();
})();
