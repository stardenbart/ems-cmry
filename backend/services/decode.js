// Penyesuaian nilai setelah dekode register — fungsi murni, tanpa dependensi.
//
// Ini BUKAN konversi satuan. Yang dikerjakan di sini adalah penyandian khusus
// perangkat, sama seperti menyusun int64 dari empat register: sifatnya bagian
// dari cara membaca, bukan pilihan tampilan. Karena itu diterapkan di collector,
// bukan saat data dibaca kembali.

// Power factor dengan konvensi Schneider/IEEE.
//
// Register PF pada PM2200 berkisar -2..2, bukan -1..1. Nilai di luar [-1, 1]
// menandakan beban leading (kapasitif) dan harus dilipat balik:
//
//   v >  1  ->  -(2 - v)      contoh 1,304 -> -0,696  (leading)
//   v < -1  ->   (2 + v)      contoh -1,304 ->  0,696
//
// Tanda negatif dipakai untuk menandai leading, positif untuk lagging. Tanpa
// pelipatan ini, fasa kapasitif akan tampil sebagai 1,304 — angka yang mustahil
// untuk power factor dan langsung membuat orang tidak percaya sistemnya.
function lipatPowerFactor(v) {
  if (v === null || v === undefined) return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n > 1) return -(2 - n);
  if (n < -1) return 2 + n;
  return n;
}

// Terapkan penyesuaian sesuai conv_mode parameter.
//
//   none / template  nilai perangkat dipakai apa adanya
//   manual           nilai * scale + offset
//   pf_ieee          pelipatan power factor di atas
function terapkan(nilai, param) {
  if (nilai === null || nilai === undefined) return nilai;
  const mode = (param && param.conv_mode) || 'none';

  if (mode === 'pf_ieee') return lipatPowerFactor(nilai);

  if (mode === 'manual') {
    const skala = param.scale === undefined || param.scale === null ? 1 : Number(param.scale);
    const geser = param.offset === undefined || param.offset === null ? 0 : Number(param.offset);
    const n = Number(nilai);
    if (!Number.isFinite(n)) return null;
    return n * skala + geser;
  }

  return nilai;
}

module.exports = { lipatPowerFactor, terapkan };
