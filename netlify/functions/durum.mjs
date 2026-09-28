// GET /api/durum/:kod  -> öğrencilerin okuduğu durum (CDN'de 1 sn önbelleklenir)
// GET /api/canli/:kod  -> öğretmen ekranı (jeton ister, önbelleğe alınmaz)
import {
  depo, kodGecerli, metaAnahtari, sayilariGetir, durumGovdesi, jetonDogru, json, hata,
} from "../lib/ortak.mjs";

// Aynı fonksiyon örneğine aynı anda gelen öğrenci istekleri tek bir okumayı
// paylaşır (CDN önbelleği ıskalasa bile depo saniyede ~1 kez okunur).
const OMUR_MS = 800;
const onbellek = new Map(); // kod -> { t, is: Promise<{ meta, sayilar } | null> }

function oku(store, kod) {
  const simdi = Date.now();
  const kayit = onbellek.get(kod);
  if (kayit && simdi - kayit.t < OMUR_MS) return kayit.is;
  const is = (async () => {
    const meta = await store.get(metaAnahtari(kod), { type: "json" });
    if (!meta) return null;
    const zaman = Date.now();
    return { meta, zaman, sayilar: await sayilariGetir(store, kod, meta.tur) };
  })();
  is.catch(() => onbellek.delete(kod));
  onbellek.set(kod, { t: simdi, is });
  if (onbellek.size > 500) {
    for (const [k, v] of onbellek) if (simdi - v.t > 10_000) onbellek.delete(k);
  }
  return is;
}

export default async (req, context) => {
  if (req.method !== "GET") return hata("Yalnızca GET kabul edilir.", 405);
  const kod = String(context.params?.kod || "").toUpperCase();
  if (!kodGecerli(kod)) return hata("Kod geçersiz.", 400);

  const ogretmen = new URL(req.url).pathname.startsWith("/api/canli/");
  const store = depo();

  if (ogretmen) {
    const meta = await store.get(metaAnahtari(kod), { type: "json" });
    if (!meta) return hata("Bu kodla bir oylama bulunamadı.", 404);
    if (!jetonDogru(req.headers.get("x-ikilem-jeton"), meta.jetonOzet)) {
      return hata("Bu oturumu yönetme yetkiniz yok.", 403);
    }
    const zaman = Date.now();
    const sayilar = await sayilariGetir(store, kod, meta.tur);
    return json(durumGovdesi(meta, sayilar, true, zaman));
  }

  const okuma = await oku(store, kod);
  if (!okuma) return hata("Bu kodla bir oylama bulunamadı.", 404);
  const govde = durumGovdesi(okuma.meta, okuma.sayilar, false, okuma.zaman);

  // Aynı sınıftaki yüzlerce telefon aynı saniyede sorsa bile fonksiyon
  // saniyede yalnızca bir kez çalışır; geri kalanı Netlify CDN'den döner.
  return json(govde, 200, {
    "cache-control": "public, max-age=0, must-revalidate",
    "netlify-cdn-cache-control": "public, s-maxage=1",
  });
};

export const config = { path: ["/api/durum/:kod", "/api/canli/:kod"] };
