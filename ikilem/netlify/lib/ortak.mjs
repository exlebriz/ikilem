// İkilem — sunucusuz fonksiyonların ortak kitaplığı
//
// Veri modeli (Netlify Blobs, "ikilem" deposu, güçlü tutarlılık):
//
//   s/{KOD}/meta                         oturum bilgisi (JSON)
//   s/{KOD}/r/{TUR}/{KIMLIK}/{ZAMAN}-{S}  tek bir oy (S = 1 ya da 2)
//
// Her oy kendi anahtarına yazılır; ortak bir sayaç yoktur. Böylece aynı anda
// yüzlerce kişi oy verse de yazmalar birbirini ezemez. Sayım, turun anahtar
// listesinden yapılır: her kimliğin yalnızca en yeni oyu geçerlidir.

import { getStore } from "@netlify/blobs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const depo = () => getStore({ name: "ikilem", consistency: "strong" });

// Karışabilecek karakterler (I, L, O, 0, 1) alfabede yok.
const ALFABE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const KOD_DESENI = /^[A-HJKMNP-Z2-9]{5}$/;
const KIMLIK_DESENI = /^[A-Za-z0-9_-]{12,64}$/;

export const SORU_UZUNLUK = 160;
export const SECENEK_UZUNLUK = 40;
export const GECMIS_SINIRI = 40;

export const kodGecerli = (k) => typeof k === "string" && KOD_DESENI.test(k);
export const kimlikGecerli = (k) => typeof k === "string" && KIMLIK_DESENI.test(k);

export function yeniKod() {
  // Reddetme örneklemesi: modülo yanlılığı olmadan 31 harfli alfabeden seçim
  let kod = "";
  while (kod.length < 5) {
    for (const b of randomBytes(8)) {
      if (b < 248 && kod.length < 5) kod += ALFABE[b % 31];
    }
  }
  return kod;
}

export const yeniJeton = () => randomBytes(24).toString("base64url");
export const ozet = (s) => createHash("sha256").update(s).digest("hex");

export function jetonDogru(jeton, jetonOzet) {
  if (typeof jeton !== "string" || jeton.length < 16 || typeof jetonOzet !== "string") return false;
  const a = Buffer.from(ozet(jeton), "hex");
  const b = Buffer.from(jetonOzet, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const metaAnahtari = (kod) => `s/${kod}/meta`;
const turOneki = (kod, tur) => `s/${kod}/r/${tur}/`;
const kisiOneki = (kod, tur, kimlik) => `s/${kod}/r/${tur}/${kimlik}/`;

/** Oyu yazar ve aynı kişinin aynı turdaki eski oylarını siler. */
export async function oyYaz(store, kod, tur, kimlik, secim) {
  const zaman = String(Date.now()).padStart(13, "0");
  const anahtar = `${kisiOneki(kod, tur, kimlik)}${zaman}-${secim}`;
  await store.set(anahtar, String(secim));
  const { blobs } = await store.list({ prefix: kisiOneki(kod, tur, kimlik) });
  const eskiler = blobs.map((b) => b.key).filter((k) => k < anahtar);
  await Promise.all(eskiler.map((k) => store.delete(k)));
}

/** Turun oylarını sayar. Aynı kimliğin birden çok kaydı varsa en yenisi geçerlidir. */
export async function sayilariGetir(store, kod, tur) {
  const onek = turOneki(kod, tur);
  const { blobs } = await store.list({ prefix: onek });
  const sonOy = new Map(); // kimlik -> "ZAMAN-S"
  for (const { key } of blobs) {
    const [kimlik, iz] = key.slice(onek.length).split("/");
    if (!kimlik || !iz) continue;
    const onceki = sonOy.get(kimlik);
    if (!onceki || iz > onceki) sonOy.set(kimlik, iz);
  }
  const sayilar = [0, 0];
  for (const iz of sonOy.values()) {
    const s = iz.slice(-1);
    if (s === "1") sayilar[0]++;
    else if (s === "2") sayilar[1]++;
  }
  return sayilar;
}

export function temizMetin(deger, azami) {
  if (typeof deger !== "string") return "";
  return deger
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, azami);
}

export function secenekleriTemizle(liste) {
  const a = Array.isArray(liste) ? liste : [];
  return [temizMetin(a[0], SECENEK_UZUNLUK), temizMetin(a[1], SECENEK_UZUNLUK)];
}

/**
 * İstemciye giden durum. Gizli oylamada öğrenciye sayılar gönderilmez.
 * "zaman", sayımın başladığı an olmalıdır: istemci bundan eski yanıtları yok sayar.
 */
export function durumGovdesi(meta, sayilar, ogretmen = false, zaman = Date.now()) {
  const toplam = sayilar[0] + sayilar[1];
  const govde = {
    kod: meta.kod,
    tur: meta.tur,
    soru: meta.soru,
    secenekler: meta.secenekler,
    acik: meta.acik,
    gizli: meta.gizli,
    toplam,
    sayilar: meta.gizli && !ogretmen ? null : sayilar,
    zaman,
  };
  if (ogretmen) govde.gecmis = meta.gecmis || [];
  return govde;
}

export function json(veri, durum = 200, ekBasliklar = {}) {
  return new Response(JSON.stringify(veri), {
    status: durum,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...ekBasliklar,
    },
  });
}

export const hata = (mesaj, durum = 400, ek = {}) => json({ hata: mesaj, ...ek }, durum);

export async function govdeOku(req) {
  try {
    const metin = await req.text();
    if (metin.length > 4000) return null;
    return JSON.parse(metin);
  } catch {
    return null;
  }
}
