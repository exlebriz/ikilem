// İkilem — öğretmen ekranı
import {
  api, yerel, yoklayici, sayiAnimasyonu, yuzdeler, sayiBicimi, bildir, hareketAzalt,
} from "./ortak.js";
import qrcode from "../vendor/qrcode.js";

const OTURUM_ANAHTARI = "ikilem:ogretmen";
const PANEL_ANAHTARI = "ikilem:panel-kapali";
const $ = (id) => document.getElementById(id);

const sahne = $("sahne");
const arena = $("arena");
const pencere = $("pencere");

// Arena şablonunu iki renk katmanına da yerleştir
const sablon = $("arenaSablon");
arena.querySelectorAll(".katman").forEach((k) => k.append(sablon.content.cloneNode(true)));
const alanlar = (ad) => arena.querySelectorAll(`[data-alan="${ad}"]`);
const yaz = (ad, metin) => alanlar(ad).forEach((el) => { el.textContent = metin; });

let oturum = yerel.al(OTURUM_ANAHTARI); // { kod, jeton }
let durum = null;
let sonZaman = 0;
let mesgul = false;

const anim = {
  p1: sayiAnimasyonu(), p2: sayiAnimasyonu(),
  s1: sayiAnimasyonu(), s2: sayiAnimasyonu(),
  toplam: sayiAnimasyonu(), gizli: sayiAnimasyonu(),
};

// ---------------------------------------------------------------- karekod
function qrCiz(hedef, metin) {
  const q = qrcode(0, "M");
  q.addData(metin);
  q.make();
  const n = q.getModuleCount();
  const kenar = 4; // standardın istediği sessiz bölge
  const boy = n + kenar * 2;
  let yol = "";
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!q.isDark(r, c)) { c++; continue; }
      let uz = 1;
      while (c + uz < n && q.isDark(r, c + uz)) uz++;
      yol += `M${c + kenar} ${r + kenar}h${uz}v1h-${uz}z`;
      c += uz;
    }
  }
  hedef.innerHTML =
    `<svg viewBox="0 0 ${boy} ${boy}" shape-rendering="crispEdges" role="img" aria-label="Katılım karekodu">` +
    `<rect width="${boy}" height="${boy}" fill="#fff"/><path d="${yol}" fill="#16152f"/></svg>`;
}

function katilimiGoster(kod) {
  const adres = `${location.origin}/k/${kod}`;
  $("kod").textContent = kod;
  $("kodMini").textContent = kod;
  $("adres").textContent = `${location.host}/k/${kod}`;
  for (const id of ["qr", "qrMini"]) {
    $(id).href = adres;
    qrCiz($(id), adres);
  }
  document.title = `İkilem: ${kod}`;
}

// ---------------------------------------------------------------- sunucu
const canliGetir = () =>
  api(`/api/canli/${oturum.kod}`, { basliklar: { "x-ikilem-jeton": oturum.jeton } });

async function oturumAc(yeni = false) {
  if (!yeni && oturum?.kod && oturum?.jeton) {
    try {
      const d = await canliGetir();
      katilimiGoster(oturum.kod);
      uygula(d);
      return;
    } catch (e) {
      if (![400, 403, 404].includes(e.durum)) throw e; // ağ sorunu: eski oturumu koru
    }
  }
  const d = await api("/api/oturum", { yontem: "POST", govde: {} });
  oturum = { kod: d.kod, jeton: d.jeton };
  yerel.koy(OTURUM_ANAHTARI, oturum);
  durum = null;
  sonZaman = 0;
  katilimiGoster(d.kod);
  uygula(d);
}

async function yonet(islem, ek = {}, basariMesaji) {
  if (mesgul || !oturum) return;
  mesgul = true;
  try {
    const d = await api("/api/yonet", {
      yontem: "POST",
      govde: { kod: oturum.kod, jeton: oturum.jeton, islem, ...ek },
    });
    uygula(d);
    if (basariMesaji) bildir(basariMesaji);
  } catch (e) {
    if (e.durum === 403 || e.durum === 404) {
      bildir("Bu oturum artık geçerli değil. Yeni bir kod oluşturuldu.", 4000);
      await oturumAc(true);
    } else {
      bildir(e.message, 4000);
    }
  } finally {
    mesgul = false;
  }
}

// ---------------------------------------------------------------- ekrana yansıtma
function artisGoster(taraf, miktar) {
  if (hareketAzalt() || miktar <= 0) return;
  const el = document.createElement("span");
  el.className = `artis artis-${taraf}`;
  el.textContent = `+${miktar}`;
  const x = 8 + Math.random() * 10;
  el.style[taraf === 1 ? "left" : "right"] = `${x}%`;
  el.style.bottom = `${34 + Math.random() * 12}%`;
  el.addEventListener("animationend", () => el.remove());
  arena.append(el);
}

function imza(d) {
  return JSON.stringify([d.tur, d.soru, d.secenekler, d.acik, d.gizli, d.sayilar, d.toplam, (d.gecmis || []).length]);
}

function uygula(d) {
  if (!d || typeof d.tur !== "number") return false;
  if (durum) {
    if (d.tur < durum.tur) return false; // CDN'den gelmiş eski yanıt
    if (d.tur === durum.tur && d.zaman < sonZaman) return false;
  }
  const onceki = durum;
  const degisti = !onceki || imza(onceki) !== imza(d);
  const yeniTur = !onceki || onceki.tur !== d.tur;
  const aciklandi = onceki && onceki.gizli && !d.gizli && d.tur === onceki.tur;
  durum = d;
  sonZaman = d.zaman;

  const [a, b] = d.sayilar || [0, 0];
  const toplam = d.toplam;
  const [p1, p2] = yuzdeler([a, b]);

  // Soru ve seçenekler
  yaz("soru", d.soru || "1 mi, 2 mi?");
  alanlar("soru").forEach((el) => el.classList.toggle("soru-bos", !d.soru));
  yaz("e1", d.secenekler[0] || "");
  yaz("e2", d.secenekler[1] || "");

  // Durum sınıfları
  arena.classList.toggle("durum-gizli", d.gizli);
  arena.classList.toggle("durum-bos", !d.gizli && toplam === 0);
  arena.classList.toggle("durum-sonuc", !d.gizli && toplam > 0);

  // Sınır ve rakamlar
  const gorunur = !d.gizli && toplam > 0;
  arena.style.setProperty("--x", `${gorunur ? p1 : 50}%`);

  if (yeniTur || aciklandi || (onceki && onceki.toplam === 0 && toplam > 0)) {
    anim.p1.ayarla(0); anim.p2.ayarla(0); anim.s1.ayarla(0); anim.s2.ayarla(0);
  }
  const sure = aciklandi ? 1400 : 700;
  anim.p1.git(gorunur ? p1 : 0, sure, (v) => yaz("p1", v));
  anim.p2.git(gorunur ? p2 : 0, sure, (v) => yaz("p2", v));
  anim.s1.git(a, sure, (v) => yaz("s1", `${sayiBicimi.format(v)} oy`));
  anim.s2.git(b, sure, (v) => yaz("s2", `${sayiBicimi.format(v)} oy`));
  anim.gizli.git(toplam, 600, (v) => yaz("gizliSayi", `${sayiBicimi.format(v)} oy`));
  anim.toplam.git(toplam, 600, (v) => { $("katilimci").textContent = sayiBicimi.format(v); });

  // Önde olan tarafın rakamı genişler, geride kalanınki daralır
  alanlar("y1").forEach((el) => { el.style.fontStretch = `${gorunur ? 75 + p1 / 2 : 100}%`; });
  alanlar("y2").forEach((el) => { el.style.fontStretch = `${gorunur ? 75 + p2 / 2 : 100}%`; });

  if (onceki && !yeniTur && gorunur && onceki.sayilar) {
    artisGoster(1, a - onceki.sayilar[0]);
    artisGoster(2, b - onceki.sayilar[1]);
  }

  // Panel
  $("rozet").hidden = d.acik;
  const nokta = $("nokta");
  nokta.className = d.acik ? "nokta" : "nokta kapali";
  $("durumMetni").textContent = d.acik
    ? d.gizli ? "Oylama açık, sonuçlar gizli" : "Oylama açık"
    : "Oylama bitti";
  $("btnBitir").firstChild.textContent = d.acik ? "Oylamayı bitir " : "Oylamayı yeniden aç ";
  $("btnGizle").firstChild.textContent = d.gizli ? "Sonuçları göster " : "Sonuçları gizle ";

  // Ekran okuyucu özeti
  $("ozetMetin").textContent = d.gizli
    ? `${toplam} oy verildi, sonuçlar gizli.`
    : `${d.soru || "Oylama"}: 1. seçenek yüzde ${p1}, ${a} oy. 2. seçenek yüzde ${p2}, ${b} oy.`;

  if (!onceki || (onceki.gecmis || []).length !== (d.gecmis || []).length) gecmisiCiz(d.gecmis || []);
  if (yeniTur && onceki) bildir(`Yeni oylama başladı (${d.tur}. tur)`);

  document.body.classList.remove("yukleniyor");
  return degisti;
}

function gecmisiCiz(gecmis) {
  const liste = $("gecmisListe");
  liste.replaceChildren();
  for (const g of [...gecmis].reverse()) {
    const [p1, p2] = yuzdeler(g.sayilar);
    const li = document.createElement("li");
    li.className = "gecmis-oge";
    const soru = document.createElement("p");
    soru.className = "gecmis-soru";
    soru.textContent = `${g.tur}. ${g.soru || "Sözlü soru"}`;
    const bar = document.createElement("div");
    bar.className = "mini-bar";
    bar.style.setProperty("--x", `${p1}%`);
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label", `1. seçenek yüzde ${p1}, 2. seçenek yüzde ${p2}`);
    const rakam = document.createElement("p");
    rakam.className = "gecmis-rakam";
    const sol = document.createElement("span");
    sol.textContent = `${g.secenekler[0] || "1"}: %${p1} (${g.sayilar[0]})`;
    const sag = document.createElement("span");
    sag.textContent = `${g.secenekler[1] || "2"}: %${p2} (${g.sayilar[1]})`;
    rakam.append(sol, sag);
    li.append(soru, bar, rakam);
    liste.append(li);
  }
  $("gecmisSay").textContent = gecmis.length ? `(${gecmis.length})` : "";
  $("gecmisBos").hidden = gecmis.length > 0;
  $("btnCsv").hidden = gecmis.length === 0;
}

// ---------------------------------------------------------------- CSV
function csvIndir() {
  if (!durum) return;
  const satirlar = [...(durum.gecmis || [])];
  if (durum.toplam > 0 && durum.sayilar) {
    satirlar.push({ tur: durum.tur, soru: durum.soru, secenekler: durum.secenekler, sayilar: durum.sayilar, baslangic: null, bitis: null });
  }
  const hucre = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const tarih = (t) => (t ? new Date(t).toLocaleString("tr-TR") : "");
  const baslik = ["Tur", "Soru", "Seçenek 1", "Seçenek 2", "Oy 1", "Oy 2", "Toplam", "Yüzde 1", "Yüzde 2", "Başlangıç", "Bitiş"];
  const govde = satirlar.map((g) => {
    const [p1, p2] = yuzdeler(g.sayilar);
    return [g.tur, g.soru, g.secenekler[0] || "1", g.secenekler[1] || "2", g.sayilar[0], g.sayilar[1],
      g.sayilar[0] + g.sayilar[1], p1, p2, tarih(g.baslangic), g.bitis ? tarih(g.bitis) : "devam ediyor"];
  });
  // Türkçe Excel için noktalı virgül ve UTF-8 BOM
  const metin = "\uFEFF" + [baslik, ...govde].map((s) => s.map(hucre).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([metin], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `ikilem-${durum.kod}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- denetimler
function pencereyiAc() {
  if (!durum) return;
  $("soruGirdi").value = "";
  $("secenek1").value = durum.secenekler[0] || "";
  $("secenek2").value = durum.secenekler[1] || "";
  $("gizliGirdi").checked = false;
  $("pencereNot").textContent = durum.toplam > 0
    ? `Şu anki sonuçlar (${sayiBicimi.format(durum.toplam)} oy) önceki oylamalara kaydedilir.`
    : "Bu oylamada henüz oy yok.";
  pencere.showModal();
  $("soruGirdi").focus();
}

$("btnYeni").addEventListener("click", pencereyiAc);
$("btnIptal").addEventListener("click", () => pencere.close());
$("hazirlar").addEventListener("click", (e) => {
  const d = e.target.closest(".hazir");
  if (!d) return;
  $("secenek1").value = d.dataset.a;
  $("secenek2").value = d.dataset.b;
});
$("soruGirdi").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("yeniForm").requestSubmit(); }
});
$("yeniForm").addEventListener("submit", (e) => {
  e.preventDefault();
  pencere.close();
  yonet("yeni", {
    soru: $("soruGirdi").value,
    secenekler: [$("secenek1").value, $("secenek2").value],
    gizli: $("gizliGirdi").checked,
  });
});

const bitirAc = () => durum && yonet(durum.acik ? "bitir" : "ac", {}, durum.acik ? "Oylama bitti" : "Oylama yeniden açıldı");
const gizleGoster = () => durum && yonet(durum.gizli ? "goster" : "gizle", {}, durum.gizli ? null : "Sonuçlar gizlendi");
$("btnBitir").addEventListener("click", bitirAc);
$("btnGizle").addEventListener("click", gizleGoster);

function tamEkran() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => bildir("Tarayıcı tam ekrana izin vermedi."));
}
$("btnTam").addEventListener("click", tamEkran);
document.addEventListener("fullscreenchange", () => {
  $("btnTam").textContent = document.fullscreenElement ? "Tam ekrandan çık" : "Tam ekran";
});

function panelAyarla(kapali) {
  sahne.classList.toggle("panel-kapali", kapali);
  $("miniQr").hidden = !kapali;
  $("btnPanelAc").hidden = !kapali;
  yerel.koy(PANEL_ANAHTARI, kapali);
}
$("btnPanel").addEventListener("click", () => panelAyarla(true));
$("btnPanelAc").addEventListener("click", () => panelAyarla(false));
panelAyarla(Boolean(yerel.al(PANEL_ANAHTARI)));

$("btnCsv").addEventListener("click", csvIndir);
$("btnOturum").addEventListener("click", async () => {
  if (!confirm("Yeni bir katılım kodu oluşturulacak. Öğrencilerin yeni karekodu okutması gerekir. Devam edilsin mi?")) return;
  try { await oturumAc(true); bildir("Yeni kod hazır"); } catch (e) { bildir(e.message, 4000); }
});

document.addEventListener("keydown", (e) => {
  if (pencere.open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest("input, textarea, select, [contenteditable]")) return;
  const t = e.key.toLocaleLowerCase("tr");
  if (t === "n") { e.preventDefault(); pencereyiAc(); }
  else if (t === "b") bitirAc();
  else if (t === "g") gizleGoster();
  else if (t === "f") tamEkran();
  else if (t === "p") panelAyarla(!sahne.classList.contains("panel-kapali"));
});

// Yansıtılan ekran uyku moduna geçmesin
let uyanik = null;
async function uyanikTut() {
  try { if (document.visibilityState === "visible" && "wakeLock" in navigator) uyanik = await navigator.wakeLock.request("screen"); } catch { /* izin yok */ }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") uyanikTut(); });

// ---------------------------------------------------------------- başlat
const yoklama = yoklayici({
  hizli: 1000,
  yavas: 2500,
  is: async () => {
    if (!oturum) { await oturumAc(); return true; }
    if (!durum) { await oturumAc(); return true; }
    return uygula(await canliGetir());
  },
  uzerindeDegisim: (basarili, hata) => {
    const nokta = $("nokta");
    if (!basarili) {
      nokta.className = "nokta sorunlu";
      $("durumMetni").textContent = hata?.durum === 0 ? "Bağlantı yok, yeniden deneniyor" : hata?.message || "Hata";
      if (hata?.durum === 403 || hata?.durum === 404) { oturum = null; durum = null; bildir("Oturum bulunamadı; yeni bir kod oluşturuluyor.", 4000); }
    }
  },
});

(async () => {
  try { await oturumAc(); } catch (e) { $("durumMetni").textContent = e.message; $("nokta").className = "nokta sorunlu"; }
  uyanikTut();
  yoklama.baslat();
})();
