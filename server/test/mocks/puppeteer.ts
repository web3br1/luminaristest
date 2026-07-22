// Jest stand-in for the ESM-only `puppeteer` package (mapped via moduleNameMapper).
// The app imports puppeteer at module load (lib/pdf.ts) but only calls launch() when a PDF is
// actually rendered — which no test does. Failing launch loudly keeps that assumption honest.
export default {
  launch(): Promise<never> {
    return Promise.reject(new Error('puppeteer is stubbed out under Jest — PDF rendering is not available in tests'));
  },
};
