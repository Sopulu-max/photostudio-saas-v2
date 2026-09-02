import type { NextConfig } from "next";

/**
 * SHIPPING CHROMIUM WITH THE ROUTES THAT PRINT.
 *
 * Every PDF in this app is made by loading a page in a headless browser, and in
 * production that browser is @sparticuz/chromium — a Chromium built for
 * serverless and shipped as brotli archives in its own `bin` folder. Those
 * archives are 68 MB and are opened at RUNTIME by a path the package computes
 * for itself.
 *
 * Nothing imports them. Next traces a function's files by following imports, so
 * a file nobody imports is a file nobody knows to send, and the function
 * deployed without them. The failure said so exactly:
 *
 *   The input directory "/var/task/node_modules/@sparticuz/chromium/bin"
 *   does not exist. Please provide the location of the brotli files.
 *
 * `/var/task` is the serverless root — this was only ever broken in production,
 * which is why every local PDF worked. And it was broken for the invoice and
 * receipt documents long before the booking confirmation existed; that one is
 * simply the first anybody pressed.
 *
 * Not a bundling problem: Next already opts both @sparticuz/chromium and
 * puppeteer-core out of Server Component bundling by default, so they are
 * required natively and their code arrives fine. It is only the binaries that
 * have to be asked for.
 *
 * The keys are picomatch globs matched against the ROUTE PATH, and the
 * brackets of a dynamic segment are escaped the way Next's own documentation
 * escapes them. Both forms happen to match here — picomatch falls back to
 * treating an unmatched bracket group literally, which I checked rather than
 * assumed — but unescaped `[token]` is ALSO a character class, so it would
 * quietly match `/booking/t/pdf` as well. The escaped form says only what is
 * meant.
 *
 * Listed one route at a time rather than behind a wildcard, because 68 MB
 * belongs in the three functions that print and in no others.
 */
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/booking/\\[token\\]/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/invoice/\\[token\\]/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
    '/receipt/\\[token\\]/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
};

export default nextConfig;
