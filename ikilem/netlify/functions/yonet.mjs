// POST /api/yonet  { kod, jeton, islem, ... }
//   islem: "yeni"   -> mevcut sonuçları geçmişe yaz, yeni tur başlat (soru, secenekler, gizli)
//          "bitir"  -> oy vermeyi kapat
//          "ac"     -> oy vermeyi yeniden aç
//          "gizle"  -> sonuçları gizle
//          "goster" -> sonuçları göster
import {
  depo, kodGecerli, metaAnahtari, sayilariGetir, durumGovdesi, jetonDogru,
  json, hata, govdeOku, temizMetin, secenekleriTemizle, SORU_UZUNLUK, GECMIS_SINIRI,
} from "../lib/ortak.mjs";

export default async (req) => {
  if (req.method !== "POST") return hata("Yalnızca POST kabul edilir.", 405);
  const g = await govdeOku(req);
  if (!g) return hata("İstek okunamadı.");

  const kod = String(g.kod || "").toUpperCase();
  if (!kodGecerli(kod)) return hata("Kod geçersiz.");

  const store = depo();
  const meta = await store.get(metaAnahtari(kod), { type: "json" });
  if (!meta) return hata("Bu kodla bir oylama bulunamadı.", 404);
  if (!jetonDogru(g.jeton, meta.jetonOzet)) return hata("Bu oturumu yönetme yetkiniz yok.", 403);

  let zaman = Date.now();
  let sayilar = await sayilariGetir(store, kod, meta.tur);

  switch (g.islem) {
    case "yeni": {
      if (sayilar[0] + sayilar[1] > 0) {
        meta.gecmis = [
          ...(meta.gecmis || []),
          {
            tur: meta.tur,
            soru: meta.soru,
            secenekler: meta.secenekler,
            sayilar,
            baslangic: meta.turBaslangic,
            bitis: Date.now(),
          },
        ].slice(-GECMIS_SINIRI);
      }
      meta.tur += 1;
      meta.soru = temizMetin(g.soru, SORU_UZUNLUK);
      meta.secenekler = secenekleriTemizle(g.secenekler);
      meta.acik = true;
      meta.gizli = Boolean(g.gizli);
      meta.turBaslangic = Date.now();
      sayilar = [0, 0];
      zaman = Date.now();
      break;
    }
    case "bitir": meta.acik = false; break;
    case "ac": meta.acik = true; break;
    case "gizle": meta.gizli = true; break;
    case "goster": meta.gizli = false; break;
    default: return hata("Bilinmeyen işlem.");
  }

  await store.setJSON(metaAnahtari(kod), meta);
  return json(durumGovdesi(meta, sayilar, true, zaman));
};

export const config = { path: "/api/yonet" };
