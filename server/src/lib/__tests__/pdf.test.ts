import puppeteer from 'puppeteer';
import { htmlToPdf, closePdfBrowser } from '../pdf';

jest.mock('puppeteer', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

const mockedLaunch = (puppeteer as unknown as { launch: jest.Mock }).launch;

function makeBrowser() {
  const page = {
    setContent: jest.fn().mockResolvedValue(undefined),
    pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 fake')),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const browser = {
    newPage: jest.fn().mockResolvedValue(page),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return { browser, page };
}

describe('lib/pdf', () => {
  afterEach(async () => {
    await closePdfBrowser();
    jest.clearAllMocks();
  });

  it('returns a PDF buffer and closes the page after each render', async () => {
    const { browser, page } = makeBrowser();
    mockedLaunch.mockResolvedValue(browser);

    const buf = await htmlToPdf('<html></html>');

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toContain('%PDF');
    expect(page.setContent).toHaveBeenCalledWith('<html></html>', { waitUntil: 'load' });
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it('launches Chromium once and reuses it across renders (singleton)', async () => {
    const { browser } = makeBrowser();
    mockedLaunch.mockResolvedValue(browser);

    await htmlToPdf('<a>1</a>');
    await htmlToPdf('<a>2</a>');

    expect(mockedLaunch).toHaveBeenCalledTimes(1);
    expect(browser.newPage).toHaveBeenCalledTimes(2);
  });

  it('re-launches after the shared browser is closed', async () => {
    const first = makeBrowser();
    const second = makeBrowser();
    mockedLaunch.mockResolvedValueOnce(first.browser).mockResolvedValueOnce(second.browser);

    await htmlToPdf('<a>1</a>');
    await closePdfBrowser();
    expect(first.browser.close).toHaveBeenCalledTimes(1);

    await htmlToPdf('<a>2</a>');
    expect(mockedLaunch).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed launch — a later render retries', async () => {
    const { browser } = makeBrowser();
    mockedLaunch.mockRejectedValueOnce(new Error('launch boom')).mockResolvedValueOnce(browser);

    await expect(htmlToPdf('<a/>')).rejects.toThrow('launch boom');
    const buf = await htmlToPdf('<a/>');

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(mockedLaunch).toHaveBeenCalledTimes(2);
  });

  it('closePdfBrowser is a no-op when no browser is open', async () => {
    await expect(closePdfBrowser()).resolves.toBeUndefined();
    expect(mockedLaunch).not.toHaveBeenCalled();
  });
});
