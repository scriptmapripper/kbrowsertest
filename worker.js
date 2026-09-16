// Cloudflare Worker: a CORS-friendly mirror of Krunker's matchmaker.
//
// Setup (free, ~2 minutes):
//   1. dash.cloudflare.com -> Workers & Pages -> Create -> Worker
//   2. Paste this file in, Deploy
//   3. Copy the worker URL, e.g. https://krunker-games.<you>.workers.dev
//   4. In script.js set:  var custom_proxy = "https://krunker-games.<you>.workers.dev";
//
// Responses are cached for 10 seconds, so refreshing the page every few
// seconds won't hammer Krunker's servers.

const UPSTREAM = "https://matchmaker.krunker.io/game-list?hostname=krunker.io";
const CACHE_SECONDS = 10;

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
};

export default {
    async fetch(request) {
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        if (request.method !== "GET") {
            return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
        }

        const cache = caches.default;
        const cacheKey = new Request(UPSTREAM, { method: "GET" });

        let upstream = await cache.match(cacheKey);

        if (!upstream) {
            try {
                upstream = await fetch(UPSTREAM, {
                    headers: { "User-Agent": "KBrowser/1.0", "Accept": "application/json" },
                    cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true }
                });
            } catch (e) {
                return json({ error: "upstream unreachable", detail: String(e) }, 502);
            }

            if (!upstream.ok) {
                return json({ error: "upstream returned HTTP " + upstream.status }, 502);
            }

            upstream = new Response(upstream.body, upstream);
            upstream.headers.set("Cache-Control", "public, max-age=" + CACHE_SECONDS);
            await cache.put(cacheKey, upstream.clone());
        }

        const body = await upstream.text();

        return new Response(body, {
            status: 200,
            headers: {
                ...CORS_HEADERS,
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "public, max-age=" + CACHE_SECONDS
            }
        });
    }
};

function json(obj, status) {
    return new Response(JSON.stringify(obj), {
        status: status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
}
