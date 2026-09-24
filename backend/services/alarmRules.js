// Evaluasi aturan alarm — bagian yang menentukan dipisah sebagai fungsi murni
// supaya bisa diuji tanpa database maupun perangkat.
//
// Dua hal yang membedakannya dari alarm ambang biasa:
//   hold_seconds  kondisi harus bertahan sekian detik sebelum alarm menyala,
//                 supaya satu lonjakan sesaat tidak membangunkan orang.
//   jendela aktif kondisi hanya dinilai pada rentang jam tertentu, misalnya
//                 alarm tekanan yang hanya relevan saat shift produksi.

const OPERATOR = {
  '>':  (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<':  (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
};

function bandingkan(nilai, operator, ambang) {
  const fn = OPERATOR[operator];
  if (!fn) return false;
  const v = Number(nilai);
  if (!Number.isFinite(v)) return false;
  return fn(v, Number(ambang));
}

// Jendela aktif harian. Mendukung rentang yang melewati tengah malam,
// misalnya 22:00 sampai 06:00 untuk shift malam.
function dalamJendela(rule, waktu) {
  if (!rule.active_from || !rule.active_to) return true;
  const menit = waktu.getHours() * 60 + waktu.getMinutes();
  const urai = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const dari = urai(rule.active_from);
  const sampai = urai(rule.active_to);
  return dari <= sampai ? (menit >= dari && menit <= sampai) : (menit >= dari || menit <= sampai);
}

// Tentukan keadaan aturan berikutnya.
//
// state: { melanggarSejak, menyala } — disimpan pemanggil antar evaluasi.
// Mengembalikan { state, aksi } dengan aksi 'nyala', 'padam', atau null.
function evaluasi(rule, nilai, state, sekarang) {
  const waktu = sekarang || new Date();
  const prev = state || { melanggarSejak: null, menyala: false };

  if (!rule.enabled) return { state: { melanggarSejak: null, menyala: false }, aksi: prev.menyala ? 'padam' : null };

  if (!dalamJendela(rule, waktu)) {
    // Di luar jendela aktif kondisinya tidak dinilai. Alarm yang sedang menyala
    // dipadamkan supaya tidak menggantung sampai besok.
    return { state: { melanggarSejak: null, menyala: false }, aksi: prev.menyala ? 'padam' : null };
  }

  const melanggar = bandingkan(nilai, rule.operator, rule.threshold);

  if (!melanggar) {
    return { state: { melanggarSejak: null, menyala: false }, aksi: prev.menyala ? 'padam' : null };
  }

  const sejak = prev.melanggarSejak || waktu;
  const lama = (waktu - sejak) / 1000;
  const cukupLama = lama >= Number(rule.hold_seconds || 0);

  if (cukupLama && !prev.menyala) {
    return { state: { melanggarSejak: sejak, menyala: true }, aksi: 'nyala' };
  }
  return { state: { melanggarSejak: sejak, menyala: prev.menyala }, aksi: null };
}

// Isi penanda {{...}} pada template email. Penanda yang tidak dikenali dibiarkan
// apa adanya supaya kesalahan ketik terlihat, bukan diam-diam jadi kosong.
function isiTemplate(teks, nilai) {
  return String(teks).replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (cocok, kunci) =>
    (nilai[kunci] === undefined || nilai[kunci] === null ? cocok : String(nilai[kunci])));
}

module.exports = { bandingkan, dalamJendela, evaluasi, isiTemplate, OPERATOR };
