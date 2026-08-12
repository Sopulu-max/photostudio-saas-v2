import puppeteer, { type Browser } from 'puppeteer-core';

/**
 * Turning a document page into a real PDF file.
 *
 * The page is loaded in a headless browser and printed. That is deliberately
 * the same page the client sees on their link — not a second template written
 * for print. A separate PDF layout is a second definition of what an invoice
 * looks like, and the two drift the first time someone edits one of them. The
 * cost is a browser on the server, which is the trade that was chosen.
 *
 * The print stylesheet in globals.css does the rest: everything outside .q-doc
 * is hidden, so the file contains the document and none of the app around it.
 */

/**
 * Where Chromium comes from.
 *
 * In production there is no browser on the machine, so @sparticuz/chromium
 * supplies one built for serverless. In development the bundled binary is the
 * wrong platform (it targets Linux; this repo is developed on Windows), so a
 * locally installed Chrome is used instead. PUPPETEER_EXECUTABLE_PATH overrides
 * both, for anyone whose Chrome lives somewhere unusual.
 */
const LOCAL_CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean) as string[];

async function launch(): Promise<Browser> {
  if (process.env.NODE_ENV === 'production') {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const { existsSync } = await import('fs');
  const local = LOCAL_CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!local) {
    throw new Error(
      'No local Chrome found for PDF generation. Install Chrome, or set PUPPETEER_EXECUTABLE_PATH to its binary.'
    );
  }
  return puppeteer.launch({ executablePath: local, headless: true });
}

/**
 * Render a page of this app to PDF bytes.
 *
 * `url` must be publicly reachable without a session — the document links are
 * capability tokens, exactly so this can load them the way a client would.
 * Anything requiring a login would render as the login page.
 */
export async function renderPageToPdf(url: string): Promise<Uint8Array> {
  let browser: Browser | null = null;
  try {
    browser = await launch();
    const page = await browser.newPage();

    // networkidle0 rather than load: the logo is a remote image, and a document
    // that prints before it arrives is missing the studio's own mark.
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    // Print rules are what strip the app chrome, so render as print, not screen.
    await page.emulateMediaType('print');

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
    return pdf;
  } finally {
    await browser?.close();
  }
}
