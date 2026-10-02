/**
 * The browser identity provider traffic uses. Some providers block library user agents
 * (ParkStay's queue middleware answers HTTP-library and scripting-language user agents with a
 * queue redirect page), so provider sessions present a desktop Chrome user agent, never a
 * library default. The partition's sign-in and payment windows use the same one.
 */

export const CHROME_MAJOR_VERSION = '131';

export const CHROME_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR_VERSION}.0.0.0 Safari/537.36`;
