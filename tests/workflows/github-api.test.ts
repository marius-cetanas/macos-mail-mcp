import { describe, it, expect } from "vitest";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { API, REST_PAGE, githubHeaders, nextPageUrl, readPages } from "../../scripts/github-api.mjs";

/**
 * The reader every check shares. `copilot-round.mjs` had it, `changelog-sections.mjs` imported it
 * from there, and `check-freshness.mjs` had its own fetch that followed redirects; each script's
 * tests still drive its own reads through this, and what is held here is the contract itself — paging,
 * the two refusals, and the two things about fetch the refusals rest on, measured on the Node that
 * runs the suite rather than asserted from one machine.
 */

/**
 * A `fetch` that answers from a queue and records what it was asked. `link` becomes the answer's
 * `Link` header, which is how a list says there is another page; a real `Response` always has
 * `headers`, so every answer here does too.
 */
const fetchStub = (
  answers: Array<{ ok?: boolean; status?: number; body?: unknown; link?: string }>
) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const a = answers.shift() ?? { ok: true, body: {} };
    return {
      ok: a.ok ?? true,
      status: a.status ?? 200,
      headers: new Headers(a.link === undefined ? {} : { link: a.link }),
      json: async () => a.body ?? {},
    } as unknown as Response;
  };
  return { fetch, calls };
};

const FIRST = `${API}/repos/o/r/pulls/7/reviews?per_page=${REST_PAGE}`;
const NEXT = `${API}/repositories/1/pulls/7/reviews?per_page=${REST_PAGE}&page=2`;
const THIRD = `${API}/repositories/1/pulls/7/reviews?per_page=${REST_PAGE}&page=3`;
const link = (url: string) => `<${url}>; rel="next", <${THIRD}>; rel="last"`;

const read = (answers: Parameters<typeof fetchStub>[0]) => {
  const { fetch, calls } = fetchStub(answers);
  const result = readPages({
    fetch: fetch as unknown as typeof globalThis.fetch,
    headers: githubHeaders("t", "macos-mail-mcp-test"),
    url: FIRST,
    where: "pulls/7/reviews",
  });
  return { calls, result };
};

describe("githubHeaders", () => {
  it("carries the token, GitHub's media type and the caller's user agent", () => {
    expect(githubHeaders("t", "macos-mail-mcp-x")).toEqual({
      authorization: "Bearer t",
      accept: "application/vnd.github+json",
      "user-agent": "macos-mail-mcp-x",
    });
  });
});

describe("readPages", () => {
  it("asks for the most GitHub serves a page", () => {
    expect(REST_PAGE).toBe(100);
  });

  it("reads every page of a list, in order, following Link: rel=\"next\"", async () => {
    const { calls, result } = read([
      { body: [{ id: 1 }], link: link(NEXT) },
      { body: [{ id: 2 }], link: link(THIRD) },
      { body: [{ id: 3 }] },
    ]);
    await expect(result).resolves.toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(calls.map((c) => c.url)).toEqual([FIRST, NEXT, THIRD]);
  });

  // The compare endpoint pages its commits and says so in a `Link` header, and the object on every
  // page is the same object; the single pull request endpoint sends no header at all. Either way a
  // resource is one request.
  it("returns a resource as it is, in one request, whatever Link it carries", async () => {
    const { calls, result } = read([{ body: { behind_by: 3 }, link: link(NEXT) }]);
    await expect(result).resolves.toEqual({ behind_by: 3 });
    expect(calls).toHaveLength(1);
  });

  it("sends the headers, and refuses redirects, on every request", async () => {
    const { calls, result } = read([{ body: [], link: link(NEXT) }, { body: [] }]);
    await result;
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.init?.headers).toEqual(githubHeaders("t", "macos-mail-mcp-test"));
      expect(call.init?.redirect).toBe("manual");
    }
  });

  it("names the status when a read fails, and which page", async () => {
    await expect(read([{ ok: false, status: 404 }]).result).rejects.toThrow("GET pulls/7/reviews -> 404");
    await expect(
      read([{ body: [], link: link(NEXT) }, { ok: false, status: 500 }]).result
    ).rejects.toThrow("GET pulls/7/reviews (page 2) -> 500");
  });

  // Under `redirect: "manual"` fetch hands back the 3xx itself, which is not `ok`, so the other
  // origin's answer is never read as a page — what the measurement below shows fetch does.
  it("reports a 3xx as a failed read rather than reading the other origin's answer", async () => {
    await expect(read([{ ok: false, status: 302 }]).result).rejects.toThrow("GET pulls/7/reviews -> 302");
  });

  it("refuses a next page off api.github.com before requesting it", async () => {
    const { calls, result } = read([
      { body: [{ id: 1 }], link: '<https://example.com/reviews?page=2>; rel="next"' },
    ]);
    await expect(result).rejects.toThrow(
      "GET pulls/7/reviews (page 2) -> not followed: https://example.com/reviews?page=2 is off api.github.com"
    );
    expect(calls).toHaveLength(1);
  });

  it("refuses a page that is not a list after one that was, rather than merging it in", async () => {
    await expect(
      read([{ body: [{ id: 1 }], link: link(NEXT) }, { body: { message: "moved" } }]).result
    ).rejects.toThrow("GET pulls/7/reviews (page 2) -> not a list");
  });

  /**
   * What the two refusals rest on, measured on the Node that runs this suite rather than asserted
   * from one machine. Two listeners on different ports are two origins.
   */
  describe("what fetch does on the Node running this suite", () => {
    const listen = (handle: (req: IncomingMessage, res: ServerResponse) => void) =>
      new Promise<Server>((resolve) => {
        const server = createServer(handle);
        server.listen(0, "127.0.0.1", () => resolve(server));
      });
    const origin = (server: Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const close = (...servers: Server[]) => {
      for (const server of servers) {
        server.closeAllConnections();
        server.close();
      }
    };

    /*
     * Why the origin refusal is not redundant with fetch's own protection. fetch drops a caller-set
     * `authorization` header only when a redirect crosses origins. A next link is a fresh request, so
     * it keeps the header — which is what would carry the token off api.github.com if the refusal
     * were removed. If a Node release ever stops sending it, this fails, and the refusal's reason has
     * changed.
     */
    it("keeps the token on a fresh request to another origin, and drops it across a redirect", async () => {
      const seen: Array<{ path: string | undefined; authorization: string | null }> = [];
      const elsewhere = await listen((req, res) => {
        seen.push({ path: req.url, authorization: req.headers.authorization ?? null });
        res.end("[]");
      });
      const api = await listen((_req, res) => {
        res.writeHead(302, { location: `${origin(elsewhere)}/redirected` });
        res.end();
      });

      try {
        const headers = { authorization: "Bearer t" };
        await (await fetch(`${origin(elsewhere)}/next`, { headers })).text();
        await (await fetch(`${origin(api)}/redirect`, { headers })).text();
      } finally {
        close(api, elsewhere);
      }

      expect(seen).toEqual([
        { path: "/next", authorization: "Bearer t" },
        { path: "/redirected", authorization: null },
      ]);
    });

    // What `redirect: "manual"` does: the 3xx comes back, it is not `ok`, and nothing is sent to the
    // location it names.
    it("gets the 3xx back under redirect: manual, and nothing reaches the other origin", async () => {
      const reached: string[] = [];
      const elsewhere = await listen((req, res) => {
        reached.push(req.url ?? "");
        res.end("[]");
      });
      const api = await listen((_req, res) => {
        res.writeHead(302, { location: `${origin(elsewhere)}/redirected` });
        res.end();
      });

      let status = 0;
      let ok = true;
      try {
        const res = await fetch(`${origin(api)}/page`, {
          headers: { authorization: "Bearer t" },
          redirect: "manual",
        });
        ({ status, ok } = res);
        await res.text();
      } finally {
        close(api, elsewhere);
      }

      expect({ status, ok, reached }).toEqual({ status: 302, ok: false, reached: [] });
    });
  });
});

/**
 * `Link` headers exactly as GitHub sent them for `GET /pulls/24/reviews?per_page=5` on this
 * repository on 2026-09-14: the first page, a middle one, and the last, which names no `next`.
 */
const LINK_FIRST =
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=2>; rel="next", ' +
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=4>; rel="last"';
const LINK_MIDDLE =
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=1>; rel="prev", ' +
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=3>; rel="next", ' +
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=4>; rel="last", ' +
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=1>; rel="first"';
const LINK_LAST =
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=3>; rel="prev", ' +
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=1>; rel="first"';

describe("nextPageUrl", () => {
  it("reads the next page off the first page's header", () => {
    expect(nextPageUrl(LINK_FIRST)).toBe(
      "https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=2"
    );
  });

  /*
   * On a middle page `prev` comes first. A reader that took the first link would go from page 2
   * back to page 1, whose first link is page 2 again — round and round, never reaching the last.
   */
  it("finds next by name, wherever it sits", () => {
    expect(nextPageUrl(LINK_MIDDLE)).toBe(
      "https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=3"
    );
  });

  it("is null on the last page, which names no next", () => {
    expect(nextPageUrl(LINK_LAST)).toBe(null);
  });

  // A list that fits on one page sends no `Link` header at all — measured on #24's 18 reviews with
  // no `per_page` — and neither does the single pull request endpoint.
  it("is null when there is no header", () => {
    expect(nextPageUrl(null)).toBe(null);
    expect(nextPageUrl(undefined)).toBe(null);
    expect(nextPageUrl("")).toBe(null);
  });
});
