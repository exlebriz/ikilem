// İkilem — yerel sunucu (Netlify CLI olmadan hızlı deneme ve test için)
//
//   node test/yerel-sunucu.mjs          ->  http://localhost:8888
//
// Netlify'ın kendi yerel Blobs sunucusunu (BlobsServer) başlatır, netlify/functions
// içindeki fonksiyonları "config.path" kalıplarına göre yönlendirir ve public/
// klasörünü netlify.toml'daki /k/* kuralıyla birlikte sunar. Gerçek dağıtımda
// bu dosya kullanılmaz.

import http from "node:http";
import { readFile, readdir, mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BlobsServer } from "@netlify/blobs/server";

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8888);

// 1) Blobs
const dizin = await mkdtemp(path.join(tmpdir(), "ikilem-blobs-"));
const jeton = "yerel-gelistirme";
const blobs = new BlobsServer({ directory: dizin, token: jeton, port: 0 });
const { port: blobPort } = await blobs.start();
const blobAdres = `http://localhost:${blobPort}`;
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(
  JSON.stringify({ edgeURL: blobAdres, uncachedEdgeURL: blobAdres, siteID: "yerel-site", token: jeton }),
).toString("base64");

// 2) Fonksiyonlar
const rotalar = [];
const fonkDizin = path.join(kok, "netlify/functions");
for (const ad of await readdir(fonkDizin)) {
  if (!ad.endsWith(".mjs")) continue;
  const mod = await import(pathToFileURL(path.join(fonkDizin, ad)).href);
  for (const kalip of [].concat(mod.config?.path || `/.netlify/functions/${ad.replace(".mjs", "")}`)) {
    const adlar = [];
    const desen = new RegExp(
      "^" + kalip.replace(/:([a-zA-Z_]+)/g, (_, n) => { adlar.push(n); return "([^/]+)"; }) + "/?$",
    );
    rotalar.push({ desen, adlar, isleyici: mod.default, ad });
  }
}

const TURLER = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2",
  ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon",
};

async function statikDosya(yol) {
  let hedef = path.join(kok, "public", decodeURIComponent(yol));
  if (!hedef.startsWith(path.join(kok, "public"))) return null;
  try {
    const s = await stat(hedef);
    if (s.isDirectory()) hedef = path.join(hedef, "index.html");
    return { govde: await readFile(hedef), tur: TURLER[path.extname(hedef)] || "application/octet-stream" };
  } catch {
    return null;
  }
}

const sunucu = http.createServer(async (istek, yanit) => {
  const url = new URL(istek.url, `http://${istek.headers.host}`);
  try {
    for (const r of rotalar) {
      const m = url.pathname.match(r.desen);
      if (!m) continue;
      const params = Object.fromEntries(r.adlar.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
      const parcalar = [];
      for await (const p of istek) parcalar.push(p);
      const govde = parcalar.length ? Buffer.concat(parcalar) : undefined;
      const req = new Request(url, {
        method: istek.method,
        headers: istek.headers,
        body: ["GET", "HEAD"].includes(istek.method) ? undefined : govde,
      });
      const res = await r.isleyici(req, { params, ip: istek.socket.remoteAddress });
      yanit.writeHead(res.status, Object.fromEntries(res.headers));
      yanit.end(Buffer.from(await res.arrayBuffer()));
      return;
    }
    // netlify.toml: /k/*  ->  /k/index.html (200)
    const yol = /^\/k\/[^/]+\/?$/.test(url.pathname) ? "/k/index.html" : url.pathname;
    const dosya = await statikDosya(yol);
    if (!dosya) { yanit.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); yanit.end("Bulunamadı"); return; }
    yanit.writeHead(200, { "content-type": dosya.tur, "cache-control": "no-cache" });
    yanit.end(dosya.govde);
  } catch (e) {
    console.error(e);
    yanit.writeHead(500, { "content-type": "application/json" });
    yanit.end(JSON.stringify({ hata: String(e?.message || e) }));
  }
});

sunucu.listen(PORT, () => {
  console.log(`İkilem yerel sunucu: http://localhost:${PORT}`);
  console.log(`Fonksiyonlar: ${[...new Set(rotalar.map((r) => r.ad))].join(", ")}`);
});

const kapat = async () => { sunucu.close(); await blobs.stop(); process.exit(0); };
process.on("SIGINT", kapat);
process.on("SIGTERM", kapat);
