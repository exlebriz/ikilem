// İkilem — yük ve doğruluk testi
//
//   node test/yerel-sunucu.mjs &            (ya da: netlify dev)
//   node test/yuk-testi.mjs [adres] [kisi]  (varsayılan: http://localhost:8888 300)
//
// Aynı anda yüzlerce kişinin oy vermesini, fikir değiştirmesini ve aynı
// telefondan iki seçeneğe neredeyse aynı anda dokunulmasını dener; sonunda
// sayımın birebir doğru olup olmadığını denetler.

const ADRES = process.argv[2] || "http://localhost:8888";
const N = Number(process.argv[3] || 300);
let hataSayisi = 0;
const sureler = [];

async function istek(yol, govde, basliklar = {}) {
  const t = performance.now();
  const r = await fetch(ADRES + yol, {
    method: govde ? "POST" : "GET",
    headers: { "content-type": "application/json", ...basliklar },
    body: govde ? JSON.stringify(govde) : undefined,
  });
  sureler.push(performance.now() - t);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(j?.hata || r.status), { durum: r.status, j });
  return j;
}

const kimlik = (i) => `test-kimlik-${String(i).padStart(6, "0")}-x`;
function denetle(kosul, ileti) {
  console.log(`${kosul ? "GEÇTİ " : "KALDI "} ${ileti}`);
  if (!kosul) hataSayisi++;
}
const yuzdelik = (dizi, p) => { const s = [...dizi].sort((a, b) => a - b); return s[Math.floor((s.length - 1) * p)]; };

const o = await istek("/api/oturum", {});
const { kod, jeton } = o;
console.log(`Oturum ${kod}, ${N} sanal katılımcı\n`);

// 1) Herkes aynı anda oy verir
const secimler = new Map();
let t0 = performance.now();
await Promise.all(Array.from({ length: N }, async (_, i) => {
  const s = Math.random() < 0.62 ? 1 : 2;
  secimler.set(i, s);
  await istek("/api/oy", { kod, tur: 1, secim: s, kimlik: kimlik(i) });
}));
console.log(`1. dalga: ${N} eşzamanlı oy ${(performance.now() - t0).toFixed(0)} ms`);
let d = await istek(`/api/canli/${kod}`, null, { "x-ikilem-jeton": jeton });
let beklenen = [0, 0]; for (const s of secimler.values()) beklenen[s - 1]++;
denetle(d.sayilar[0] === beklenen[0] && d.sayilar[1] === beklenen[1], `sayım doğru: ${d.sayilar} = beklenen ${beklenen}`);

// 2) %40'ı fikir değiştirir (yine eşzamanlı)
const degisen = [...secimler.keys()].filter(() => Math.random() < 0.4);
t0 = performance.now();
await Promise.all(degisen.map(async (i) => {
  const s = secimler.get(i) === 1 ? 2 : 1;
  secimler.set(i, s);
  await istek("/api/oy", { kod, tur: 1, secim: s, kimlik: kimlik(i) });
}));
console.log(`2. dalga: ${degisen.length} kişi fikir değiştirdi ${(performance.now() - t0).toFixed(0)} ms`);
d = await istek(`/api/canli/${kod}`, null, { "x-ikilem-jeton": jeton });
beklenen = [0, 0]; for (const s of secimler.values()) beklenen[s - 1]++;
denetle(d.sayilar[0] === beklenen[0] && d.sayilar[1] === beklenen[1], `değişiklik sonrası sayım: ${d.sayilar} = ${beklenen}`);
denetle(d.toplam === N, `kişi sayısı şişmedi: ${d.toplam} = ${N}`);

// 3) Aynı cihazdan iki seçeneğe neredeyse aynı anda dokunma (en kötü yarış durumu)
const yaris = Array.from({ length: 40 }, (_, k) => N + k);
await Promise.all(yaris.map((i) => Promise.all([
  istek("/api/oy", { kod, tur: 1, secim: 1, kimlik: kimlik(i) }),
  istek("/api/oy", { kod, tur: 1, secim: 2, kimlik: kimlik(i) }),
])));
d = await istek(`/api/canli/${kod}`, null, { "x-ikilem-jeton": jeton });
denetle(d.toplam === N + yaris.length, `çift dokunuşta her cihaz tek oy: ${d.toplam} = ${N + yaris.length}`);

// 4) Eşzamanlı okuma
t0 = performance.now();
const okumalar = await Promise.all(Array.from({ length: N }, () => istek(`/api/durum/${kod}`)));
console.log(`${N} eşzamanlı durum okuması ${(performance.now() - t0).toFixed(0)} ms`);
denetle(okumalar.every((x) => x.toplam === d.toplam), "tüm okumalar aynı toplamı gördü");

// 5) Güvenlik ve kurallar
try { await istek("/api/yonet", { kod, jeton: "yanlis-jeton-yanlis-jeton", islem: "yeni" }); denetle(false, "yanlış jeton reddedilmeli"); }
catch (e) { denetle(e.durum === 403, "yanlış jetonla yönetim reddedildi (403)"); }
try { await istek("/api/oy", { kod, tur: 1, secim: 3, kimlik: kimlik(1) }); denetle(false, "secim=3 reddedilmeli"); }
catch (e) { denetle(e.durum === 400, "geçersiz seçim reddedildi (400)"); }

// 6) Gizli mod öğrenciye sayı sızdırmaz
await istek("/api/yonet", { kod, jeton, islem: "gizle" });
await new Promise((r) => setTimeout(r, 1200)); // önbellek ömrü (~1 sn) dolsun
const gizli = await istek(`/api/durum/${kod}`);
denetle(gizli.sayilar === null && gizli.toplam === d.toplam, "gizli modda öğrenci yalnızca toplamı görür");
await istek("/api/yonet", { kod, jeton, islem: "goster" });

// 7) Yeni oylama: sonuçlar geçmişe, sayaç sıfıra
const y = await istek("/api/yonet", { kod, jeton, islem: "yeni", soru: "Test sorusu", secenekler: ["Evet", "Hayır"] });
denetle(y.tur === 2 && y.toplam === 0, "yeni tur sıfırdan başladı");
const son = y.gecmis.at(-1);
denetle(son && son.sayilar[0] + son.sayilar[1] === d.toplam, `önceki tur geçmişe yazıldı (${son?.sayilar})`);

// 8) Kapalı oylamaya oy
await istek("/api/yonet", { kod, jeton, islem: "bitir" });
try { await istek("/api/oy", { kod, tur: 2, secim: 1, kimlik: kimlik(1) }); denetle(false, "kapalı oylama oy almamalı"); }
catch (e) { denetle(e.durum === 423, "kapalı oylamaya oy reddedildi (423)"); }

console.log(`\nİstek süreleri: medyan ${yuzdelik(sureler, 0.5).toFixed(0)} ms, %95 ${yuzdelik(sureler, 0.95).toFixed(0)} ms, toplam ${sureler.length} istek`);
console.log(hataSayisi ? `\n${hataSayisi} denetim KALDI` : "\nTüm denetimler geçti");
process.exit(hataSayisi ? 1 : 0);
