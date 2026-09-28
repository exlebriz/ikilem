// POST /api/oy  { kod, tur, secim: 1|2, kimlik }
import {
  depo, kodGecerli, kimlikGecerli, metaAnahtari, oyYaz, sayilariGetir,
  durumGovdesi, json, hata, govdeOku,
} from "../lib/ortak.mjs";

export default async (req) => {
  if (req.method !== "POST") return hata("Yalnızca POST kabul edilir.", 405);
  const g = await govdeOku(req);
  if (!g) return hata("İstek okunamadı.");

  const kod = String(g.kod || "").toUpperCase();
  const tur = Number(g.tur);
  const secim = Number(g.secim);
  if (!kodGecerli(kod)) return hata("Kod geçersiz.");
  if (!kimlikGecerli(g.kimlik)) return hata("Cihaz kimliği geçersiz.");
  if (secim !== 1 && secim !== 2) return hata("Seçim 1 ya da 2 olmalı.");
  if (!Number.isInteger(tur) || tur < 1) return hata("Tur geçersiz.");

  const store = depo();
  const meta = await store.get(metaAnahtari(kod), { type: "json" });
  if (!meta) return hata("Bu kodla bir oylama bulunamadı.", 404);
  if (meta.tur !== tur) {
    const guncel = await sayilariGetir(store, kod, meta.tur);
    return hata("Yeni bir oylama başladı.", 409, { durum: durumGovdesi(meta, guncel) });
  }
  if (!meta.acik) {
    const sayilar = await sayilariGetir(store, kod, meta.tur);
    return hata("Oylama kapandı.", 423, { durum: durumGovdesi(meta, sayilar) });
  }

  await oyYaz(store, kod, tur, g.kimlik, secim);
  // Sayım burada yapılmaz: oy başına tüm listeyi okumak kalabalık sınıfta
  // maliyeti karesel büyütür. İstemci ekranı iyimser günceller; kesin sayılar
  // bir sonraki durum okumasıyla (en geç ~1 sn) gelir.
  return json({ tamam: true, tur, secim, zaman: Date.now() });
};

export const config = { path: "/api/oy" };
