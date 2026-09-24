// Validasi pembacaan — fungsi murni, tanpa database.
//
// Dua lapis:
//   1. Rentang per parameter (min/max). Menangkap nilai yang jelas di luar akal.
//   2. Koherensi antar-parameter, untuk menangkap kesalahan yang angkanya tetap
//      wajar bila dilihat satu per satu.
//
// Aturan koherensi harus benar-benar MUSTAHIL secara fisika, bukan sekadar tidak
// biasa. Versi pertama menandai dua kondisi yang ternyata sah pada beban tiga
// fasa tak seimbang, dan menghasilkan tujuh parameter suspect palsu di produksi.
// Aturan yang terlalu ketat lebih berbahaya daripada tidak ada aturan, karena
// membuat orang berhenti mempercayai penandanya.
//
// Pindaian register 24 Sep 2026 membuktikan data PM2200 di sini sah: daya per
// fasa (338,6 / 139,8 / 270,2 kW) masing-masing koheren dengan reactive dan
// apparent-nya sendiri, dan jumlahnya cocok persis dengan nilai total.

const GOOD = 0;
const SUSPECT = 1;

const REL = 0.05; // toleransi 5% untuk hubungan antar besaran

// ── Lapis 1: rentang ────────────────────────────────────────────────────────
function rangeQuality(meta, value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return SUSPECT;
  if (!meta) return GOOD;
  const v = Number(value);
  if (meta.min !== null && meta.min !== undefined && v < Number(meta.min)) return SUSPECT;
  if (meta.max !== null && meta.max !== undefined && v > Number(meta.max)) return SUSPECT;
  return GOOD;
}

// ── Lapis 2: koherensi ──────────────────────────────────────────────────────
// Pemilihan parameter memakai metadata `kind`, dengan bantuan nama untuk
// membedakan rata-rata dari per-fasa. Perangkat dengan penamaan berbeda tidak
// akan cocok, dan itu aman: aturannya dilewati, bukan salah menuduh.
function pick(params, data, kind, prefer) {
  const cands = params.filter((p) => p.kind === kind && data[p.name] !== null && data[p.name] !== undefined);
  if (cands.length === 0) return null;
  if (prefer) {
    const hit = cands.find((p) => prefer(p.name));
    if (hit) return { name: hit.name, value: Number(data[hit.name]) };
  }
  return { name: cands[0].name, value: Number(data[cands[0].name]) };
}

// Kata terakhir nama dipakai untuk mengenali fasa. Sengaja tanpa regex, supaya
// tidak ada karakter escape yang diam-diam rusak saat berkasnya disunting.
function kataAkhir(nama) {
  return String(nama).trim().split(' ').pop().toUpperCase();
}

function mengandung(teks, bagian) {
  return String(teks).toLowerCase().includes(bagian);
}

function coherenceIssues(params, data) {
  const issues = [];
  if (!Array.isArray(params)) return issues;

  const V = pick(params, data, 'voltage', (n) => mengandung(n, 'l-l avg'));
  const I = pick(params, data, 'current', (n) => kataAkhir(n) === 'AVG');
  const S = pick(params, data, 'apparent_power');
  const P = pick(params, data, 'power');
  const Q = pick(params, data, 'reactive_power');

  // S harus setara akar-3 x V_LL x I_avg. Daya dalam kVA, tegangan V, arus A,
  // sehingga hasilnya dibagi 1000. Aturan ini sudah diverifikasi terhadap meter:
  // selisihnya 0,3%.
  if (V && I && S && S.value > 0) {
    const expected = (Math.sqrt(3) * V.value * I.value) / 1000;
    if (Math.abs(expected - S.value) / S.value > REL) {
      issues.push({
        rule: 'S_vs_VI',
        detail: `${S.name} ${S.value.toFixed(1)} tidak cocok dengan akar-3 x ${V.name} x ${I.name} = ${expected.toFixed(1)}`,
        params: [S.name, V.name, I.name],
      });
    }
  }

  // Daya aktif tidak mungkin melebihi daya semu.
  if (P && S && S.value > 0 && Math.abs(P.value) > S.value * (1 + REL)) {
    issues.push({
      rule: 'P_gt_S',
      detail: `${P.name} ${P.value.toFixed(1)} melebihi ${S.name} ${S.value.toFixed(1)}`,
      params: [P.name, S.name],
    });
  }

  // akar(P^2 + Q^2) tidak boleh MELEBIHI S. Hanya arah itu yang mustahil.
  //
  // Arah sebaliknya bukan pelanggaran: Apparent Power Total adalah jumlah
  // ARITMETIK daya semu per fasa, sementara akar(P^2+Q^2) adalah jumlah VEKTOR.
  // Untuk beban tak seimbang keduanya memang berbeda jauh.
  if (P && Q && S && S.value > 0) {
    const pq = Math.sqrt(P.value * P.value + Q.value * Q.value);
    if (pq > S.value * (1 + REL)) {
      issues.push({
        rule: 'PQ_gt_S',
        detail: `akar(P^2+Q^2) ${pq.toFixed(1)} melebihi ${S.name} ${S.value.toFixed(1)}`,
        params: [P.name, Q.name, S.name],
      });
    }
  }

  // Arus netral tidak boleh melebihi JUMLAH arus ketiga fasa. Itu batas
  // Kirchhoff dan tetap berlaku walau ada harmonisa.
  //
  // Membandingkan dengan arus fasa TERTINGGI adalah aturan yang salah: fasa yang
  // seimbang besarnya bisa sangat tidak seimbang sudutnya, dan harmonisa triplen
  // menjumlah di netral. Arus netral besar pada beban seperti ini wajar.
  const phases = params
    .filter((p) => p.kind === 'current' && ['A', 'B', 'C'].includes(kataAkhir(p.name)) && data[p.name] != null)
    .map((p) => ({ name: p.name, value: Number(data[p.name]) }));
  const neutral = params.find((p) => p.kind === 'current' && kataAkhir(p.name) === 'N' && data[p.name] != null);

  if (phases.length === 3 && neutral) {
    const jumlah = phases.reduce((t, p) => t + p.value, 0);
    const iN = Number(data[neutral.name]);
    if (iN > jumlah * (1 + REL)) {
      issues.push({
        rule: 'IN_gt_sum',
        detail: `${neutral.name} ${iN.toFixed(1)} A melebihi jumlah arus ketiga fasa ${jumlah.toFixed(1)} A`,
        params: [neutral.name, ...phases.map((p) => p.name)],
      });
    }
  }

  return issues;
}

// Gabungkan kedua lapis menjadi peta quality per parameter.
function qualityMap(params, data) {
  const q = {};
  for (const p of params) {
    if (data[p.name] === undefined) continue;
    q[p.name] = rangeQuality(p, data[p.name]);
  }
  for (const issue of coherenceIssues(params, data)) {
    for (const name of issue.params) q[name] = SUSPECT;
  }
  return q;
}

module.exports = { GOOD, SUSPECT, rangeQuality, coherenceIssues, qualityMap };
