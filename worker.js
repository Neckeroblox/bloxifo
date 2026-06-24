/**
 * Bloxifo live-data proxy — Cloudflare Worker
 * --------------------------------------------
 * Browsers can't call Roblox's API directly (CORS). This Worker does it
 * server-side and returns clean JSON your site can read.
 *
 * Deploy (free):
 *   1. Go to dash.cloudflare.com -> Workers & Pages -> Create -> Worker.
 *   2. Replace the default code with this whole file. Click Deploy.
 *   3. Copy the URL it gives you (e.g. https://bloxifo-live.<you>.workers.dev).
 *   4. Paste that URL into CONFIG.proxyUrl in index.html.
 *
 * Test it:  https://<your-worker-url>/?places=95641237719290
 */

export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "public, max-age=30",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const places = (url.searchParams.get("places") || "")
      .split(",").map(s => s.trim()).filter(Boolean);

    if (!places.length) {
      return json({ error: "Pass ?places=placeId1,placeId2" }, 400, cors);
    }

    try {
      // 1) placeId -> universeId
      const universes = await Promise.all(places.map(async (pid) => {
        const r = await fetch(`https://apis.roblox.com/universes/v1/places/${pid}/universe`);
        const d = await r.json().catch(() => ({}));
        return { placeId: pid, universeId: d.universeId || null };
      }));

      const uids = universes.map(u => u.universeId).filter(Boolean);
      if (!uids.length) return json([], 200, cors);

      // 2) universeId -> game details (playing, visits, name, etc.)
      const gByU = {};
      const gr = await fetch(`https://games.roblox.com/v1/games?universeIds=${uids.join(",")}`);
      const gd = await gr.json().catch(() => ({}));
      (gd.data || []).forEach(g => { gByU[g.id] = g; });

      // 3) universeId -> game icon
      const iconByU = {};
      const ir = await fetch(
        `https://thumbnails.roblox.com/v1/games/icons?universeIds=${uids.join(",")}` +
        `&size=512x512&format=Png&isCircular=false`
      );
      const idata = await ir.json().catch(() => ({}));
      (idata.data || []).forEach(i => { iconByU[i.targetId] = i.imageUrl; });

      const out = universes.map(u => {
        const g = gByU[u.universeId] || {};
        return {
          placeId: u.placeId,
          universeId: u.universeId,
          name: g.name || null,
          playing: g.playing || 0,
          visits: g.visits || 0,
          favoritedCount: g.favoritedCount || 0,
          iconUrl: iconByU[u.universeId] || null,
        };
      });

      return json(out, 200, cors);
    } catch (err) {
      return json({ error: String(err) }, 500, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
