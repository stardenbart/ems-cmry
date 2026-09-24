// Konversi satuan — fungsi murni, tanpa database dan tanpa dependensi.
// Sengaja dipisah supaya bisa diuji di mana saja tanpa koneksi maupun node_modules.
//
// Bentuk entri peta satuan: { symbol, quantity, base_symbol, factor, offset_value }
// Hubungan ke satuan dasar:  dasar = nilai * factor + offset_value

function compatible(a, b) {
  return a && b && a.base_symbol === b.base_symbol;
}

// Konversi NILAI: factor dan offset keduanya berlaku.
function convertValue(v, from, to, map) {
  if (v === null || v === undefined || from === to) return v;
  const a = map[from];
  const b = map[to];
  if (!compatible(a, b)) return v;
  const base = Number(v) * a.factor + a.offset_value;
  return (base - b.offset_value) / b.factor;
}

// Konversi SELISIH: hanya factor.
// Offset tidak berlaku pada selisih — beda 10 K sama dengan beda 10 derajat
// Celsius, bukan beda -263. Memakai convertValue untuk selisih akan membuat
// seluruh perhitungan suhu per periode salah tanpa terlihat mencurigakan.
function convertDelta(v, from, to, map) {
  if (v === null || v === undefined || from === to) return v;
  const a = map[from];
  const b = map[to];
  if (!compatible(a, b)) return v;
  return (Number(v) * a.factor) / b.factor;
}

module.exports = { convertValue, convertDelta, compatible };
