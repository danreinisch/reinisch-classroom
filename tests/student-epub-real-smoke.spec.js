/* eslint-env node */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';

const SYNTHETIC_CODE = 'RC02B_BROWSER';

const EPUB_PATH = process.env.RC_LIBRARY_02B_EPUB_PATH;
const EXPECTED_SHA =
  '7add3244f8835f80b0bf76f0ef605eb5fd78891e10c24cd206d8a42b2d497778';

const NETLIFY_TOML_PATH = 'netlify.toml';

function readStudentCsp() {
  const text = fs.readFileSync(
    NETLIFY_TOML_PATH,
    'utf8'
  );

  const marker = 'for = "/student/*"';
  const start = text.indexOf(marker);

  if (start < 0) {
    throw new Error(
      'Student CSP header block not found'
    );
  }

  const nextHeader = text.indexOf(
    '[[headers]]',
    start + marker.length
  );

  const block = text.slice(
    start,
    nextHeader >= 0
      ? nextHeader
      : text.length
  );

  const match = block.match(
    /Content-Security-Policy\s*=\s*"([^"]+)"/
  );

  if (!match) {
    throw new Error(
      'Student Content-Security-Policy not found'
    );
  }

  return match[1];
}

function sha256(buffer) {
  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');
}

test.describe('RC-LIBRARY-02B real EPUB smoke', () => {
  test('renders the certified Lost EPUB through the secure reader path', async ({
    context,
    page,
  }) => {
    if (!EPUB_PATH || !fs.existsSync(EPUB_PATH)) {
      test.skip(
        true,
        'Certified local EPUB path is required for this non-CI smoke.'
      );
    }

    const epubBytes = fs.readFileSync(EPUB_PATH);

    expect(epubBytes.length).toBe(1018108);
    expect(sha256(epubBytes)).toBe(EXPECTED_SHA);

    const studentCsp = readStudentCsp();

    expect(studentCsp).toContain(
      "style-src 'self' 'unsafe-inline' blob: https://fonts.googleapis.com"
    );

    expect(studentCsp).toContain(
      "img-src 'self' data: blob: https:"
    );

    await context.addInitScript((studentCode) => {
      sessionStorage.setItem('rc_user_role', 'student');
      sessionStorage.setItem('rc_user_code', studentCode);

      // Make this run independent from any prior local reader progress.
      localStorage.removeItem(
        'rc_epub_cfi_lost-in-kragdon-ah'
      );
      localStorage.removeItem(
        'rc_epub_font_size_lost-in-kragdon-ah'
      );
    }, SYNTHETIC_CODE);

    let secureBookRequests = 0;

    await page.route('**/student/', async (route) => {
      const response = await route.fetch();

      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'content-security-policy': studentCsp,
        },
      });
    });

    await page.route('**/.netlify/functions/**', async (route) => {
      const url = new URL(route.request().url());

      if (url.pathname.endsWith('/student-book')) {
        expect(
          url.searchParams.get('book')
        ).toBe('lost-in-kragdon-ah');

        secureBookRequests += 1;

        await route.fulfill({
          status: 200,
          contentType: 'application/epub+zip',
          headers: {
            'Cache-Control': 'private, no-store',
            'Content-Disposition':
              'inline; filename="Lost in Kragdon-ah.epub"',
          },
          body: epubBytes,
        });

        return;
      }

      if (url.pathname.endsWith('/browser-supabase-config')) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: 'Not used by synthetic EPUB smoke',
          }),
        });
        return;
      }

      const syntheticStudent = {
        code: SYNTHETIC_CODE,
        name: 'Synthetic Student',
        active: true,
        class_id: null,
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          code: SYNTHETIC_CODE,
          name: 'Synthetic Student',
          student: syntheticStudent,
          students: [syntheticStudent],
          assignments: [],
          instances: [],
          submissions: [],
          goals: [],
          progress: [],
          data_points: [],
        }),
      });
    });

    const pageErrors = [];
    const blobCspFailures = [];
    const blobCspConsoleErrors = [];

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    page.on('requestfailed', (request) => {
      const failure =
        request.failure()?.errorText || '';

      if (
        request.url().startsWith('blob:') &&
        failure.toLowerCase().includes('csp')
      ) {
        blobCspFailures.push({
          url: request.url(),
          failure,
        });
      }
    });

    page.on('console', (message) => {
      const value = message.text();

      if (
        value.includes('blob:') &&
        /Content Security Policy|Refused to load/i.test(value)
      ) {
        blobCspConsoleErrors.push(value);
      }
    });

    await page.goto('/student/');

    await expect(
      page.locator('#studentDashboardView')
    ).toBeVisible({ timeout: 10000 });

    await page
      .locator('[data-tab="library"]:visible')
      .first()
      .click();

    const library = page.locator('#libraryContent');

    const lostCard = library.locator(
      '.st-resource-card[data-library-book="true"]',
      { hasText: 'Lost in Kragdon-ah' }
    );

    await expect(lostCard).toHaveCount(1);
    await expect(lostCard).toBeVisible();

    await lostCard.click();

    await expect(
      page.locator('#epubBookPanel')
    ).toBeVisible({ timeout: 15000 });

    await expect(
      page.locator('#epubReaderViewport iframe')
    ).toHaveCount(1, { timeout: 15000 });

    expect(secureBookRequests).toBe(1);

    // Front matter may be image-dominant or contain very little text.
    // Inspect the known EPUB.js iframe directly rather than scanning
    // unrelated browser frames.
    const epubFrame = page.frameLocator(
      '#epubReaderViewport iframe'
    );

    await expect
      .poll(
        async () => {
          return epubFrame
            .locator('body')
            .evaluate((body) => {
              const text =
                (body.innerText || '').trim();

              const images =
                body.querySelectorAll(
                'img, image, svg, object, picture'
              ).length;

              return (
                text.length > 0 ||
                images > 0
              );
            })
            .catch(() => false);
        },
        {
          timeout: 15000,
          message:
            'opening EPUB section should contain text or an image',
        }
      )
      .toBe(true);

    /*
     * The audited Copyright Page contains an EPUB image. It must resolve
     * through EPUB.js as a blob URL and actually decode. A broken <img>
     * element with naturalWidth === 0 must never count as success.
     */
    const copyrightPage = page.locator(
      '#epubTocList .st-book-toc-item',
      { hasText: 'Copyright Page' }
    ).first();

    await expect(copyrightPage).toBeVisible({
      timeout: 15000,
    });

    await copyrightPage.click();

    await expect
      .poll(
        async () => {
          return epubFrame
            .locator('img')
            .first()
            .evaluate((img) => {
              if (!img.complete) return 0;
              return img.naturalWidth;
            })
            .catch(() => 0);
        },
        {
          timeout: 15000,
          message:
            'Copyright Page EPUB image should load with nonzero width',
        }
      )
      .toBeGreaterThan(0);

    const copyrightImage =
      await epubFrame
        .locator('img')
        .first()
        .evaluate((img) => ({
          src:
            img.currentSrc ||
            img.src ||
            img.getAttribute('src') ||
            '',
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        }));

    expect(copyrightImage.src).toMatch(
      /^blob:/
    );

    expect(copyrightImage.complete).toBe(
      true
    );

    expect(
      copyrightImage.naturalWidth
    ).toBeGreaterThan(0);

    expect(
      copyrightImage.naturalHeight
    ).toBeGreaterThan(0);

    /*
     * EPUB.js may materialize publication styling without exposing a
     * separate Playwright request event. Test the rendered document:
     * at least one stylesheet must be attached with readable CSS rules.
     */
    const epubStylesheets =
      await epubFrame
        .locator('body')
        .evaluate((body) => {
          return [
            ...body.ownerDocument.styleSheets,
          ].map((sheet) => {
            let ruleCount = null;

            try {
              ruleCount =
                sheet.cssRules?.length ??
                0;
            } catch (error) {
              ruleCount = null;
            }

            return {
              href: sheet.href,
              ruleCount,
            };
          });
        });

    expect(
      epubStylesheets.length
    ).toBeGreaterThan(0);

    expect(
      epubStylesheets.some(
        (sheet) =>
          typeof sheet.ruleCount ===
            'number' &&
          sheet.ruleCount > 0
      )
    ).toBe(true);

    // Lost uses split chapter sections:
    // the TOC target is a chapter opener, followed by prose
    // in the immediately following spine item.
    const chapterOne = page.locator(
      '#epubTocList .st-book-toc-item',
      { hasText: 'Chapter One' }
    ).first();

    await expect(chapterOne).toBeVisible({
      timeout: 15000,
    });

    await chapterOne.click();

    // First prove the Chapter One opener rendered.
    await expect
      .poll(
        async () => {
          return epubFrame
            .locator('body')
            .evaluate((body) => {
              const text =
                (body.innerText || '').trim();

              const images =
                body.querySelectorAll(
                'img, image, svg, object, picture'
              ).length;

              return (
                text.length > 0 ||
                images > 0
              );
            })
            .catch(() => false);
        },
        {
          timeout: 15000,
          message:
            'Chapter One opener should render publication content',
        }
      )
      .toBe(true);

    // The audited EPUB places the actual Chapter One prose
    // in the next spine item.
    await page.locator('#epubNextBtn').click();

    await expect
      .poll(
        async () => {
          return epubFrame
            .locator('body')
            .evaluate((body) => {
              return (
                body.innerText || ''
              ).trim().length;
            })
            .catch(() => 0);
        },
        {
          timeout: 15000,
          message:
            'Next from Chapter One opener should render substantive prose',
        }
      )
      .toBeGreaterThan(1000);

    await expect(
      page.locator('#epubPrevBtn')
    ).toBeVisible();

    await expect(
      page.locator('#epubNextBtn')
    ).toBeVisible();

    await expect(
      page.locator('#epubFontDecBtn')
    ).toBeVisible();

    await expect(
      page.locator('#epubFontIncBtn')
    ).toBeVisible();

    await expect(
      page.locator('#epubTocList')
    ).not.toContainText(
      'Loading chapters…',
      { timeout: 15000 }
    );

    const cfiKey =
      'rc_epub_cfi_lost-in-kragdon-ah';

    await expect
      .poll(
        async () => {
          return page.evaluate(
            (key) => localStorage.getItem(key),
            cfiKey
          );
        },
        {
          timeout: 10000,
          message:
            'initial EPUB relocation should persist a CFI',
        }
      )
      .toContain('epubcfi(');

    const initialCfi = await page.evaluate(
      (key) => localStorage.getItem(key),
      cfiKey
    );

    await page.locator('#epubNextBtn').click();

    await expect
      .poll(
        async () => {
          return page.evaluate(() => {
            return localStorage.getItem(
              'rc_epub_cfi_lost-in-kragdon-ah'
            );
          });
        },
        {
          timeout: 10000,
          message:
            'Next navigation should persist a new EPUB CFI',
        }
      )
      .not.toBe(initialCfi);

    await page.locator('#epubFontIncBtn').click();

    const fontSetting = await page.evaluate(() => {
      return localStorage.getItem(
        'rc_epub_font_size_lost-in-kragdon-ah'
      );
    });

    expect(fontSetting).toBe('110');

    expect(page.url()).toContain('/student/');
    expect(page.url()).not.toContain('/presentation-02/');

    expect(blobCspFailures).toEqual([]);
    expect(blobCspConsoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
