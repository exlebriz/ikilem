// İkilem — öğrenci (katılımcı) ekranı
import {
  api, yerel, cihazKimligi, yoklayici, sayiAnimasyonu, yuzdeler, sayiBicimi,
  kodTemizle, kodGecerli, titret, bildir,
} from "./ortak.js";

const $ = (id) => document.getElementById(id);
const alan = $("alan");
const dugmeler = [$("sec1"), $("sec2")];
const kimlik = cihazKimligi();
const kod = kodTemizle(location.pathname.split("/")[2] || new URLSearchParams(location.search).get("k"));

let durum = null;
let sonZaman = 0;
let benimSecim = null;
let gonderiliyor = false;
let bekleyen = null;       // { secim, tur } — gönderilmeyi bekleyen en son seçim
let tekrarZamani = null;
let yoklama = null;

const oranAnim = [sayiAnimasyonu(), sayiAnimasyonu()];
const oyAnahtari = (tur) => `ikilem:oy:${kod}:${tur}`;

// Yüzde alanlarını hazırla: "%" işareti + değer
document.querySelectorAll("[data-oran]").forEach((el) => {
  const isaret = document.createElement("span");
  isaret.className = "yuzde-isaret";
  isaret.textContent = "%";
  const deger = document.createElement("span");
  deger.dataset.deger = el.dataset.oran;
  el.append(isaret, deger);
});

// ---------------------------------------------------------------- kod ekranı
function kodFormu(baslik, aciklama) {
  yoklama?.durdur();
  alan.hidden = true;
  $("ustSag").hidden = true;
  $("kodGir").hidden = false;
  if (baslik) $("kodGirBaslik").textContent = baslik;
  if (aciklama) $("kodGirAciklama").textContent = aciklama;
  const girdi = $("kodGirdi");
  girdi.addEventListener("input", () => {
    const t = kodTemizle(girdi.value);
    if (t !== girdi.value) girdi.value = t;
  });
  $("kodForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const k = kodTemizle(girdi.value);
    if (kodGecerli(k)) location.href = `/k/${k}`;
    else bildir("Kod 5 karakter olmalı.");
  });
  girdi.focus();
}

// ---------------------------------------------------------------- ekran
function imza(d) {
  return JSON.stringify([d.tur, d.soru, d.secenekler, d.acik, d.gizli, d.sayilar, d.toplam]);
}

function uygula(d) {
  if (!d || typeof d.tur !== "number") return false;
  if (durum) {
    if (d.tur < durum.tur) return false;
    if (d.tur === durum.tur && d.zaman < sonZaman) return false;
  }
  const yeniTur = durum && d.tur !== durum.tur;
  const degisti = !durum || imza(durum) !== imza(d);
  durum = d;
  sonZaman = d.zaman;
  benimSecim = yerel.al(oyAnahtari(d.tur));
  if (benimSecim !== 1 && benimSecim !== 2) benimSecim = null;

  if (yeniTur) {
    oranAnim.forEach((a) => a.ayarla(0));
    alan.classList.remove("degisiyor");
    void alan.offsetWidth;
    alan.classList.add("degisiyor");
    titret(25);
    bildir("Yeni oylama başladı");
  }
  ciz();
  return degisti;
}

function ciz() {
  const d = durum;
  alan.hidden = false;
  $("soru").textContent = d.soru || "1 mi, 2 mi?";
  const adlar = [d.secenekler[0] || "1. seçenek", d.secenekler[1] || "2. seçenek"];
  document.querySelectorAll("[data-ad]").forEach((el) => { el.textContent = adlar[el.dataset.ad - 1]; });

  const oyVerdi = benimSecim !== null;
  const sonucGoster = Boolean(d.sayilar) && (oyVerdi || !d.acik);
  const oranlar = sonucGoster ? yuzdeler(d.sayilar) : [0, 0];

  alan.classList.toggle("sonuclu", sonucGoster);
  alan.classList.toggle("bekliyor", oyVerdi && !sonucGoster);

  dugmeler.forEach((b, i) => {
    const secim = i + 1;
    b.style.setProperty("--f", `${sonucGoster ? oranlar[i] : 100}%`);
    b.classList.toggle("secili", benimSecim === secim);
    b.setAttribute("aria-pressed", String(benimSecim === secim));
    b.disabled = !d.acik;
    b.setAttribute("aria-label", sonucGoster ? `${adlar[i]}, yüzde ${oranlar[i]}` : adlar[i]);
    oranAnim[i].git(oranlar[i], 700, (v) => {
      document.querySelectorAll(`[data-deger="${secim}"]`).forEach((el) => { el.textContent = v; });
    });
  });

  $("katilim").textContent = `${sayiBicimi.format(d.toplam)} kişi`;

  let bilgi = "";
  if (!d.acik) bilgi = oyVerdi ? "Oylama bitti. Oyunuz sayıldı." : "Oylama bitti.";
  else if (!oyVerdi) bilgi = "Bir seçeneğe dokunun.";
  else if (d.gizli) bilgi = "Oyunuz alındı. Sonuçlar, öğretmen açıkladığında burada görünecek.";
  else bilgi = "Oyunuz alındı. Fikrinizi değiştirirseniz diğer seçeneğe dokunun.";
  $("bilgi").textContent = bilgi;
}

// ---------------------------------------------------------------- oy verme
function oyVer(secim) {
  if (!durum || !durum.acik) return;
  if (benimSecim === secim) return;
  titret(15);
  const onceki = benimSecim;
  benimSecim = secim;
  yerel.koy(oyAnahtari(durum.tur), secim);

  // İyimser güncelleme: sunucu yanıtını beklemeden ekranı güncelle
  if (durum.sayilar) {
    const s = [...durum.sayilar];
    if (onceki) s[onceki - 1] = Math.max(0, s[onceki - 1] - 1);
    s[secim - 1] += 1;
    durum = { ...durum, sayilar: s, toplam: s[0] + s[1] };
  } else if (!onceki) {
    durum = { ...durum, toplam: durum.toplam + 1 };
  }
  ciz();

  bekleyen = { secim, tur: durum.tur };
  gonder();
}

// Aynı cihazdan istekler sırayla gider; araya giren dokunuşlarda yalnızca son seçim gönderilir.
async function gonder() {
  if (gonderiliyor || !bekleyen) return;
  clearTimeout(tekrarZamani);
  gonderiliyor = true;
  const is = bekleyen;
  bekleyen = null;
  let agHatasi = false;
  try {
    const d = await api("/api/oy", { yontem: "POST", govde: { kod, tur: is.tur, secim: is.secim, kimlik } });
    // Oyumuzdan önce üretilmiş (CDN'deki) durum yanıtları artık yok sayılır
    if (durum && d.tur === durum.tur) sonZaman = Math.max(sonZaman, d.zaman);
  } catch (e) {
    if (e.durum === 409 || e.durum === 423) {
      yerel.sil(oyAnahtari(is.tur));
      benimSecim = null;
      bildir(e.message);
      if (e.veri?.durum) uygula(e.veri.durum);
      else if (durum) ciz();
    } else if (e.durum === 404) {
      kodFormu("Oylama bulunamadı", "Bu kod artık geçerli değil. Öğretmen ekranındaki güncel kodu girin.");
    } else if (e.durum >= 400 && e.durum < 500) {
      bildir(e.message, 4000);
    } else {
      agHatasi = true;
      if (!bekleyen) bekleyen = is;
      bildir("Oyunuz gönderilemedi, yeniden deneniyor.");
      tekrarZamani = setTimeout(gonder, 2000);
    }
  } finally {
    gonderiliyor = false;
    if (bekleyen && !agHatasi) gonder();
  }
}

dugmeler.forEach((b) => b.addEventListener("click", () => oyVer(Number(b.dataset.secim))));

// ---------------------------------------------------------------- başlat
if (!kodGecerli(kod)) {
  kodFormu();
} else {
  $("kod").textContent = kod;
  $("ustSag").hidden = false;
  document.title = `İkilem: ${kod}`;
  alan.hidden = false;
  $("soru").textContent = "Bağlanıyor";
  dugmeler.forEach((b) => { b.disabled = true; });

  yoklama = yoklayici({
    hizli: 1500,
    yavas: 4000,
    is: async () => {
      if (gonderiliyor) return false; // oy yoldayken eski sayılarla ekranı geri çekme
      try {
        return uygula(await api(`/api/durum/${kod}`));
      } catch (e) {
        if (e.durum === 404 || e.durum === 400) {
          kodFormu("Oylama bulunamadı", "Bu kodla açık bir oylama yok. Öğretmen ekranındaki kodu kontrol edin.");
          return false;
        }
        throw e;
      }
    },
    uzerindeDegisim: (basarili) => {
      $("nokta").className = basarili ? "nokta" : "nokta sorunlu";
      if (!basarili && !durum) $("soru").textContent = "Bağlantı bekleniyor";
    },
  });
  yoklama.baslat();
}
