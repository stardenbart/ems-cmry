// Validasi pembacaan — fungsi murni, tanpa database.
//
// Dua lapis:
//   1. Rentang per parameter (min/max). Menangkap nilai yang jelas di luar akal.
//   2. Koherensi antar-parameter. Menangkap kesalahan yang angkanya tetap wajar
//      bila dilihat satu per satu — kelas bug yang sudah dua kali lolos di sini.
//
// Lapis kedua bukan teori. Pada 24 Sep 2026 data live melanggar dua aturan
// sekaligus: akar-3 x V x I memberi 1178,9 kVA (cocok dengan Apparent Power)
// sementara akar(P^2 + Q^2) hanya 807,9 kVA, dan arus netral 3180 A melebihi
// arus fasa 1592-1764 A yang seimbang.

const GOOD = 0;
const SUSPECT = 1;

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
// membedakan rata-rata dari per-fasa. Perangkat yang penamaannya berbeda tidak
// akan cocok, dan itu aman: aturannya dilewati, bukan salah menuduh.
function pick(params, data, kind, prefer) {
  const cands = params.filter((p) => p.kind === kind && data[p.name] !== null && data[p.name] !== undefined);
  if (cands.length === 0) return null;
  if (prefer) {
    const hit = cands.find((p) => prefer.test(p.name));
    if (hit) return { name: hit.name, value: Number(data[hit.name]) };
  }
  return { name: cands[0].name, value: Number(data[cands[0].name]) };
}

const REL = 0.05; // toleransi 5% untuk hubungan antar besaran

function coherenceIssues(params, data) {
  const issues = [];
  if (!Array.isArray(params)) return issues;

  const V = pick(params, data, 'voltage', /l-?l\s*avg/i);
  const I = pick(params, data, 'current', /avg/i);
  const S = pick(params, data, 'apparent_power');
  const P = pick(params, data, 'power');
  const Q = pick(params, data, 'reactive_power');

  // S harus setara akar-3 x V_LL x I_avg. Satuan daya di sini kVA/kW, arus A,
  // tegangan V, jadi hasilnya dibagi 1000.
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

  // akar(P^2 + Q^2) tidak boleh melebihi S. Boleh lebih kecil, selisihnya daya
  // distorsi. Kalau jauh lebih kecil, salah satu dari P, Q, atau S salah baca.
  if (P && Q && S && S.value > 0) {
    const pq = Math.sqrt(P.value * P.value + Q.value * Q.value);
    if (pq > S.value * (1 + REL)) {
      issues.push({
        rule: 'PQ_gt_S',
        detail: `akar(P^2+Q^2) ${pq.toFixed(1)} melebihi ${S.name} ${S.value.toFixed(1)}`,
        params: [P.name, Q.name, S.name],
      });
    } else if (pq < S.value * 0.7) {
      issues.push({
        rule: 'PQ_far_below_S',
        detail: `akar(P^2+Q^2) ${pq.toFixed(1)} jauh di bawah ${S.name} ${S.value.toFixed(1)}; salah satu dari P, Q, atau S kemungkinan salah baca`,
        params: [P.name, Q.name, S.name],
      });
    }
  }

  // Arus netral tidak boleh melebihi arus fasa terbesar saat ketiga fasa seimbang.
  const phases = params
    .filter((p) => p.kind === 'current' && /\b(a|b|c)$/i.test(p.name) && data[p.name] != null)
    .map((p) => ({ name: p.name, value: Number(data[p.name]) }));
  const neutral = params.find((p) => p.kind === 'current' && /\bn$/i.test(p.name) && data[p.name] != null);

  if (phases.length === 3 && neutral) {
    const vals = phases.map((p) => p.value);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const seimbang = max > 0 && (max - min) / max < 0.2;
    const iN = Number(data[neutral.name]);
    if (seimbang && iN > max) {
      issues.push({
        rule: 'IN_gt_phase',
        detail: `${neutral.name} ${iN.toFixed(1)} A melebihi arus fasa tertinggi ${max.toFixed(1)} A padahal fasa seimbang`,
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
