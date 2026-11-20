// End-to-end check of the optional on-device model on a hosted page.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve('site/dist');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css'};
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, {'Content-Type': types[extname(path)] || 'application/octet-stream'}); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const diagnostics = [];
let browser;
try {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  page.on('console', msg => { if (msg.type() === 'error') diagnostics.push(`console: ${msg.text()}`); });
  page.on('pageerror', error => diagnostics.push(`page: ${error.stack}`));
  page.on('requestfailed', request => diagnostics.push(`request: ${request.url()} ${request.failure()?.errorText}`));
  await page.goto(`http://127.0.0.1:${server.address().port}/#intelligence`);
  await page.locator('[data-draft-start]').click();
  const status = page.locator('[data-draft-status]');
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-draft-status]')?.textContent || '';
    return text.includes('ready for review') || text.includes('could not run') || text.includes('empty draft');
  }, null, {timeout: 300000});
  const message = await status.textContent();
  const output = await page.locator('#device-draft-output').inputValue();
  if (!message.includes('ready for review') || output.trim().length < 40) throw new Error(`Inference failed: ${message}`);
  console.log(`${message}\n${output}`);
} catch (error) {
  console.error(error);
  console.error('Browser diagnostics:\n' + (diagnostics.join('\n') || '(none)'));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
