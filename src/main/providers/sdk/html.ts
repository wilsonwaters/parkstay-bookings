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
 *   dropped.
 * - Every link gets `rel="noopener noreferrer"`.
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
    allowedAttributes: { a: ['href', 'rel'], img: ['src', 'alt'] },
    // Dropped together with their content.
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'iframe'],
    allowedSchemes: ['https'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...withUrl(attribs, 'href', baseUrl), rel: 'noopener noreferrer' },
      }),
      img: (tagName, attribs) => ({ tagName, attribs: withUrl(attribs, 'src', baseUrl) }),
    },
    // An image whose source is not https would render as a broken box.
    exclusiveFilter: (frame) =>
      frame.tag === 'img' && !(frame.attribs.src ?? '').startsWith('https://'),
  });
}
