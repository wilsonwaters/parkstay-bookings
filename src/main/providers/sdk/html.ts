/**
 * `sanitizeProviderHtml`: makes a provider's HTML (a campground description, say) safe to
 * cross IPC and render in the renderer. Main sanitises every provider's detail HTML with it
 * before it leaves the main process (architecture-notes §3 `LocationDetail.descriptionHtml`).
 *
 * - Only simple text structure is kept: `p, br, hr, h3–h6, strong, em, ul, ol, li, div,
 *   span`, links (`a[href]`) and images (`img[src|alt]`). Any other tag is dropped and its
 *   text kept; `<style>`, `<script>` and `<iframe>` are dropped with their content.
 * - No other attribute survives, so `style`, `class` and `on*` handlers are gone.
 * - Relative `href` and `src` are made absolute against `baseUrl`. Only https URLs are
 *   kept: a link to anything else loses its `href`, and an image without an https `src` is
 *   dropped. An image without alt text gets `alt=""` (decoration).
 * - Every link gets `rel="noopener noreferrer"`, and a link with an `href` gets
 *   `target="_blank"`: the app window turns a new window into the system browser
 *   (`setWindowOpenHandler`), while a plain navigation away from the app is blocked, so this
 *   is what makes a description's links open at all.
 */

import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'div',
  'span',
];

/** `value` resolved against `baseUrl`, or undefined when it is missing or not a URL. */
function absolute(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value.trim(), baseUrl).href;
  } catch {
    return undefined;
  }
}

function withUrl(
  attribs: sanitizeHtml.Attributes,
  name: 'href' | 'src',
  baseUrl: string
): sanitizeHtml.Attributes {
  const result = { ...attribs };
  const url = absolute(attribs[name], baseUrl);
  if (url) result[name] = url;
  else delete result[name];
  return result;
}

export function sanitizeProviderHtml(html: string, baseUrl: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt'] },
    // Dropped together with their content.
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'iframe'],
    allowedSchemes: ['https'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const link = withUrl(attribs, 'href', baseUrl);
        // The provider's own target (`_top`, a frame name) never survives.
        delete link.target;
        // Only an https href survives the scheme filter below.
        if (link.href?.startsWith('https://')) link.target = '_blank';
        return { tagName, attribs: { ...link, rel: 'noopener noreferrer' } };
      },
      // A description's image without alt text is decoration (its text says what matters):
      // `alt=""`, never an unnamed image.
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...withUrl(attribs, 'src', baseUrl), alt: attribs.alt ?? '' },
      }),
    },
    // An image whose source is not https would render as a broken box.
    exclusiveFilter: (frame) =>
      frame.tag === 'img' && !(frame.attribs.src ?? '').startsWith('https://'),
  });
}
