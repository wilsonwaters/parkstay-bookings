/**
 * `sanitizeProviderHtml`: what a provider's description may keep before it crosses IPC.
 */

import { sanitizeProviderHtml } from '@main/providers/sdk/html';
import { parkStayFixture } from '@tests/utils/parkstay-fixture-server';

const BASE = 'https://parkstay.dbca.wa.gov.au';

describe('sanitizeProviderHtml', () => {
  it("cleans Bungarra's long_description: no style block, no style or class attributes", () => {
    const html: string = parkStayFixture('campsite_availablity_view_20.json').long_description;
    expect(html).toMatch(/<style|style=|class=/);

    const clean = sanitizeProviderHtml(html, BASE);

    expect(clean).not.toMatch(/<style|style=|class=/);
    expect(clean).toContain(
      '<img src="https://parkstay.dbca.wa.gov.au/media/parkstay/campground_images/25f050a7-6c3.jpg" alt="" />'
    );
    expect(clean).toContain('<h4><strong>This campground is in the Gascoyne Region</strong></h4>');
    // The CSS rules inside <style> are gone too, not left as text.
    expect(clean).not.toContain('text-decoration');
  });

  it('drops scripts, iframes and event handlers', () => {
    const clean = sanitizeProviderHtml(
      '<p onclick="steal()">Hi<script>alert(1)</script></p><iframe src="https://x.example"></iframe><img src="/a.jpg" onerror="x()">',
      BASE
    );
    expect(clean).toBe('<p>Hi</p><img src="https://parkstay.dbca.wa.gov.au/a.jpg" alt="" />');
  });

  it('keeps only the allowed tags, keeping the text of the others', () => {
    const clean = sanitizeProviderHtml(
      '<h2>Big</h2><table><tr><td>cell</td></tr></table><ul><li><em>a</em></li></ul><hr><br>',
      BASE
    );
    expect(clean).toBe('Bigcell<ul><li><em>a</em></li></ul><hr /><br />');
  });

  it('makes links absolute, keeps only https ones, and adds rel="noopener noreferrer"', () => {
    const clean = sanitizeProviderHtml(
      '<a href="/park" target="_top">park</a> <a href="javascript:alert(1)" target="_blank">js</a> <a href="http://insecure.example/">http</a>',
      BASE
    );
    expect(clean).toBe(
      '<a href="https://parkstay.dbca.wa.gov.au/park" target="_blank" rel="noopener noreferrer">park</a> ' +
        '<a rel="noopener noreferrer">js</a> <a rel="noopener noreferrer">http</a>'
    );
  });

  it('opens every link with an href in a new window, which the app sends to the browser', () => {
    expect(
      sanitizeProviderHtml('<p>See <a href="https://exploreparks.example/x">this</a></p>', BASE)
    ).toBe(
      '<p>See <a href="https://exploreparks.example/x" target="_blank" rel="noopener noreferrer">this</a></p>'
    );
  });

  it('drops images whose source is not https, keeps alt text, and marks the rest decorative', () => {
    expect(
      sanitizeProviderHtml(
        '<img src="http://x.example/a.jpg"><img src="data:image/png;base64,AA">',
        BASE
      )
    ).toBe('');
    expect(sanitizeProviderHtml('<img src="b.jpg" alt="Beach" width="9">', `${BASE}/media/`)).toBe(
      '<img src="https://parkstay.dbca.wa.gov.au/media/b.jpg" alt="Beach" />'
    );
  });
});
