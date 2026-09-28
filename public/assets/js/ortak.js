// İkilem — istemci tarafı ortak yardımcılar

export const hareketAzalt = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class ApiHatasi extends Error {
  constructor(mesaj, durum, veri) {
    super(mesaj);
    this.durum = durum;
    this.veri = veri;
  }
}

/** JSON API çağrısı; 8 sn zaman aşımı, anlaşılır hata iletisi. */
export async function api(yol, { yontem = "GET", govde, basliklar = {}, zamanAsimi = 8000 } = {}) {
  const kontrol = new AbortController();
  const zamanlayici = setTimeout(() => kontrol.abort(), zamanAsimi);
  try {
    const yanit = await fetch(yol, {
      method: yontem,
      headers: { ...(govde ? { "content-type": "application/json" } : {}), ...basliklar },
      body: govde ? JSON.stringify(govde) : undefined,
      signal: kontrol.signal,
      cache: "no-store",
    });
    let veri = null;
    try { veri = await yanit.json(); } catch { /* boş gövde */ }
    if (!yanit.ok) {
      throw new ApiHatasi(veri?.hata || `Sunucu ${yanit.status} döndürdü.`, yanit.status, veri);
    }
    return veri;
  } catch (e) {
    if (e instanceof ApiHatasi) throw e;
    throw new ApiHatasi("Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.", 0, null);
  } finally {
    clearTimeout(zamanlayici);
  }
}

/** Bu cihazın kalıcı, rastgele kimliği (kişisel veri içermez). */
export function cihazKimligi() {
  const ANAHTAR = "ikilem:kimlik";
  let k = null;
  try { k = localStorage.getItem(ANAHTAR); } catch { /* gizli sekme */ }
  if (!k || !/^[A-Za-z0-9_-]{12,64}$/.test(k)) {
    const b = crypto.getRandomValues(new Uint8Array(16));
    k = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    try { localStorage.setItem(ANAHTAR, k); } catch { /* yok say */ }
  }
  return k;
}

export const yerel = {
  al(anahtar) {
    try { return JSON.parse(localStorage.getItem(anahtar)); } catch { return null; }
  },
  koy(anahtar, deger) {
    try { localStorage.setItem(anahtar, JSON.stringify(deger)); } catch { /* yok say */ }
  },
  sil(anahtar) {
    try { localStorage.removeItem(anahtar); } catch { /* yok say */ }
  },
};

/**
 * Uyarlanır yoklama: bir şey değiştiğinde sık, sakin dönemde seyrek sorar;
 * sekme arka plandayken durur, öne gelince hemen sorar; hata olursa geri çekilir.
 */
export function yoklayici({ is, hizli = 1500, yavas = 4000, uzerindeDegisim }) {
  let aralik = hizli;
  let zamanlayici = null;
  let calisiyor = false;
  let durdu = false;
  let hataSayisi = 0;

  async function tur() {
    if (durdu || calisiyor) return;
    if (document.visibilityState === "hidden") return;
    calisiyor = true;
    clearTimeout(zamanlayici);
    try {
      const degisti = await is();
      hataSayisi = 0;
      aralik = degisti ? hizli : Math.min(yavas, Math.round(aralik * 1.35));
      uzerindeDegisim?.(true);
    } catch (e) {
      hataSayisi++;
      aralik = Math.min(10000, hizli * 2 ** Math.min(hataSayisi, 3));
      uzerindeDegisim?.(false, e);
    } finally {
      calisiyor = false;
      if (!durdu) zamanlayici = setTimeout(tur, aralik);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { aralik = hizli; tur(); }
  });
  window.addEventListener("online", () => { aralik = hizli; tur(); });

  return {
    baslat() { durdu = false; tur(); },
    simdi() { aralik = hizli; tur(); },
    durdur() { durdu = true; clearTimeout(zamanlayici); },
  };
}

/** Sayıyı yumuşakça bir değerden diğerine taşır: const a = sayiAnimasyonu(); a.git(64, 700, v => ...) */
export function sayiAnimasyonu() {
  let mevcut = 0;
  let kare = null;
  return {
    get deger() { return mevcut; },
    ayarla(v) { cancelAnimationFrame(kare); mevcut = v; },
    git(hedef, sure, uygula) {
      cancelAnimationFrame(kare);
      const bas = mevcut;
      if (hareketAzalt() || !sure || bas === hedef) {
        mevcut = hedef;
        uygula(Math.round(hedef));
        return;
      }
      const t0 = performance.now();
      const adim = (t) => {
        const u = Math.min(1, (t - t0) / sure);
        const e = 1 - (1 - u) ** 3;
        mevcut = bas + (hedef - bas) * e;
        uygula(Math.round(mevcut));
        if (u < 1) kare = requestAnimationFrame(adim);
        else mevcut = hedef;
      };
      kare = requestAnimationFrame(adim);
    },
  };
}

/** İki sayıdan tam sayı yüzdeler; toplamları her zaman 100 olur. */
export function yuzdeler([a, b]) {
  const t = a + b;
  if (!t) return [0, 0];
  const p1 = Math.round((a / t) * 100);
  return [p1, 100 - p1];
}

export const sayiBicimi = new Intl.NumberFormat("tr-TR");

export function kodTemizle(metin) {
  return String(metin || "")
    .toUpperCase()
    .replace(/[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]/g, "")
    .slice(0, 5);
}

export const kodGecerli = (k) => /^[A-HJKMNP-Z2-9]{5}$/.test(k);

export function titret(ms = 12) {
  try { if (!hareketAzalt()) navigator.vibrate?.(ms); } catch { /* yok say */ }
}

/** Kısa bilgi iletisi. */
export function bildir(metin, sure = 2600) {
  const el = document.getElementById("bildirim");
  if (!el) return;
  el.textContent = metin;
  el.classList.add("gorunur");
  clearTimeout(bildir._z);
  bildir._z = setTimeout(() => el.classList.remove("gorunur"), sure);
}
