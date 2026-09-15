/**
 * The GitHub reads the checks share, over an injected `fetch`: one header set, one refusal of
 * redirects, one refusal of a next page off api.github.com, one paged reader.
 *
 * Three scripts each built these for themselves. `copilot-round.mjs` had the paged reader, and
 * `changelog-sections.mjs` imported it from there — so the changelog check depended on the Copilot
 * gate for a loop that has nothing to do with Copilot, a direction `verify.yml` had to explain. And
 * `check-freshness.mjs` built its own headers and made the one request in `scripts/` that still
 * followed a redirect. One module, so a property measured once holds for every read.
 *
 * The jobs that run these scripts install nothing, and `tests/workflows/script-imports.test.ts` holds
 * this file, like the rest of `scripts/`, to Node's built-ins and to other files under `scripts/`.
 */

export const API = "https://api.github.com";

/**
 * How many items a REST list is asked for per page — the most GitHub serves.
 *
 * Measured on 2026-09-14 on `GET /pulls/{n}/reviews`, against the 511 reviews of nodejs/node#22712:
 * 30 a page with no `per_page`, and 100 for `per_page=101`. At 100 a pull request needs more than a
 * hundred reviews before a poll makes a second request for them.
 */
export const REST_PAGE = 100;

/**
 * The next page's URL from a `Link` header, or `null` when there is no next page.
 *
 * Found by name rather than taken from the first link, because the first link is not always `next`.
 * Measured on #24: a middle page lists `prev` first, and following it goes back to page 1 — whose
 * first link is `next` — so a reader of first links goes round pages 1 and 2 and never reaches 3.
 *
 * @param {string | null | undefined} link the response's `Link` header
 * @returns {string | null}
 */
export function nextPageUrl(link) {
  const match = typeof link === "string" ? /<([^<>]+)>\s*;\s*rel="next"/.exec(link) : null;
  return match ? match[1] : null;
}

/**
 * The headers every read carries: the token, GitHub's JSON media type, and a user agent naming the
 * script, which GitHub asks for and which is what a request looks like from the other side.
 *
 * @param {string} token
 * @param {string} userAgent
 */
export function githubHeaders(token, userAgent) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": userAgent,
  };
}

/**
 * Every page of a REST list, in order, or a resource as it is.
 *
 * A resource is one request, whatever `Link` it carries: the compare endpoint pages its commits and
 * says so in a header, and the object on every page is the same object. A list is every page. The
 * next page is followed as GitHub names it — under `/repositories/{id}/`, not the
 * `/repos/{owner}/{name}/` path requested — rather than rebuilt from a page number, and only on
 * api.github.com. The token rides on every request, so a link anywhere else is refused before it is
 * requested, and a page that is not a list after one that was is refused rather than merged in.
 *
 * **The refusal is not redundant with fetch's own protection.** fetch drops a caller-set
 * `authorization` header only when a redirect crosses origins; a next link is a fresh request, so
 * without the refusal the token would go wherever the link pointed. `tests/workflows/github-api.test.ts`
 * measures that on the Node running it. Both alternatives were weighed and rejected: stopping at the
 * last page read hands the caller a partial list, the defect #81 fixed, and following the link without
 * the token merges a list from an unknown host into the answer. Every `Link` measured so far was on
 * api.github.com.
 *
 * **Nor does any request follow a redirect** (raised by Copilot on #98). The origin check reads only
 * the link, and fetch follows a redirect on its own: an api.github.com URL answered with a 3xx to
 * another origin would come back `ok`, token dropped, and be read as a page. Every request here sets
 * `redirect: "manual"`, under which fetch returns the 3xx itself — measured in the same suite — so a
 * redirect is a failed read that names its status.
 *
 * @param {{ fetch: typeof globalThis.fetch, headers: Record<string, string>, url: string, where: string }} read
 *   `url` is the first page, `per_page` and all; `where` names the read in an error, as `pulls/7/reviews`.
 * @returns {Promise<unknown>} the list, every page in order; or the resource
 */
export async function readPages({ fetch, headers, url, where }) {
  const pages = [];
  for (let next = url; next; ) {
    const label = pages.length === 0 ? where : `${where} (page ${pages.length + 1})`;
    if (new URL(next).origin !== API) {
      throw new Error(`GET ${label} -> not followed: ${next} is off api.github.com`);
    }
    const res = await fetch(next, { headers, redirect: "manual" });
    if (!res.ok) throw new Error(`GET ${label} -> ${res.status}`);
    const page = await res.json();
    if (pages.length === 0 && !Array.isArray(page)) return page;
    if (!Array.isArray(page)) throw new Error(`GET ${label} -> not a list`);
    pages.push(page);
    next = nextPageUrl(res.headers.get("link"));
  }
  return pages.flat();
}
