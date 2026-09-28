// POST /api/oturum  ->  yeni öğretmen oturumu (kod + yönetim jetonu)
import {
  depo, yeniKod, yeniJeton, ozet, metaAnahtari, durumGovdesi,
  json, hata, govdeOku, temizMetin, secenekleriTemizle, SORU_UZUNLUK,
} from "../lib/ortak.mjs";

export default async (req) => {
  if (req.method !== "POST") return hata("Yalnızca POST kabul edilir.", 405);
  const govde = (await govdeOku(req)) || {};
  const store = depo();

  for (let deneme = 0; deneme < 6; deneme++) {
    const kod = yeniKod();
    const var_mi = await store.getMetadata(metaAnahtari(kod));
    if (var_mi) continue;

    const jeton = yeniJeton();
    const simdi = Date.now();
    const meta = {
      kod,
      jetonOzet: ozet(jeton),
      tur: 1,
      soru: temizMetin(govde.soru, SORU_UZUNLUK),
      secenekler: secenekleriTemizle(govde.secenekler),
      acik: true,
      gizli: false,
      gecmis: [],
      olusturma: simdi,
      turBaslangic: simdi,
    };
    await store.setJSON(metaAnahtari(kod), meta);
    return json({ jeton, ...durumGovdesi(meta, [0, 0], true) }, 201);
  }
  return hata("Oturum oluşturulamadı. Lütfen tekrar deneyin.", 503);
};

export const config = { path: "/api/oturum" };
