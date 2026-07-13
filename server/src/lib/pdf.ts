/**
 * HTML → PDF via a SINGLE shared headless-Chromium instance (puppeteer).
 *
 * ponytail: one browser launched lazily and reused for every render — per-request
 * launch would add seconds of latency + a Chromium process per call. Single-process
 * deploy (memory stay-on-sqlite-no-postgres) → one browser for the whole app; closed on
 * shutdown via closePdfBrowser(). If request isolation is ever needed, move to a page
 * pool, not a browser-per-request.
 */
import puppeteer, { type Browser } from 'puppeteer';

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    // --no-sandbox: required in most container/CI runtimes; the input HTML is our own
    // trusted, self-contained template (no remote content loaded).
    browserPromise = puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] }).catch((err) => {
      // Don't cache a failed launch — a transient failure would otherwise poison every
      // later render until process restart. Reset so the next call retries.
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

/** Renders a self-contained HTML string to an A4 PDF buffer. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // 'load' is enough — the template inlines all CSS and loads no network assets.
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/** Closes the shared browser (call on process shutdown). Safe to call when none is open. */
export async function closePdfBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  // Tolerate a still-rejecting launch promise — nothing to close in that case.
  const browser = await pending.catch(() => null);
  if (browser) await browser.close();
}
