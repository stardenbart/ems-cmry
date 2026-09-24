// Kalender shift — bagian yang menentukan dipisah sebagai fungsi murni supaya
// bisa diuji tanpa database.
//
// Shift yang melewati tengah malam dihitung MILIK HARI SAAT SHIFT DIMULAI.
// Tanpa aturan itu, produksi jam 02:00 akan tercatat di hari kalender berikutnya
// sementara operatornya menganggapnya masih shift kemarin, dan laporan per shift
// tidak akan cocok dengan catatan produksi.

function keMenit(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

// Apakah shift berlaku pada hari tertentu?
function berlakuPadaHari(shift, hariMinggu) {
  if (!shift.weekdays || shift.weekdays.length === 0) return true;
  return shift.weekdays.map(Number).includes(Number(hariMinggu));
}

// Cari shift yang sedang berjalan pada suatu waktu.
// Mengembalikan { shift, tanggalShift } atau null.
function shiftPada(shifts, waktu) {
  const menit = waktu.getHours() * 60 + waktu.getMinutes();
  const hariIni = waktu.getDay();
  const kemarin = (hariIni + 6) % 7;

  for (const s of shifts) {
    if (s.enabled === false) continue;
    const mulai = keMenit(s.start_time);
    const selesai = keMenit(s.end_time);
    if (mulai === null || selesai === null) continue;

    if (mulai < selesai) {
      // Shift dalam satu hari
      if (berlakuPadaHari(s, hariIni) && menit >= mulai && menit < selesai) {
        return { shift: s, tanggalShift: tanggalLokal(waktu) };
      }
    } else {
      // Shift melewati tengah malam
      if (berlakuPadaHari(s, hariIni) && menit >= mulai) {
        return { shift: s, tanggalShift: tanggalLokal(waktu) };
      }
      if (berlakuPadaHari(s, kemarin) && menit < selesai) {
        const sebelum = new Date(waktu.getTime() - 24 * 3600 * 1000);
        return { shift: s, tanggalShift: tanggalLokal(sebelum) };
      }
    }
  }
  return null;
}

function tanggalLokal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Sifat sebuah hari, memperhitungkan penanda khusus di kalender.
// penanda: { '2026-12-25': 'holiday', ... }
function sifatHari(tanggal, penanda, hariLiburMingguan) {
  const khusus = penanda ? penanda[tanggal] : undefined;
  if (khusus) return khusus;
  const hari = new Date(`${tanggal}T00:00:00`).getDay();
  const libur = hariLiburMingguan === undefined ? [0] : hariLiburMingguan;
  return libur.includes(hari) ? 'holiday' : 'production';
}

// Apakah dua tanggal setara untuk dibandingkan? Dipakai baseline supaya hari
// kerja hanya dibandingkan dengan hari kerja.
function setara(a, b, penanda, hariLiburMingguan) {
  return sifatHari(a, penanda, hariLiburMingguan) === sifatHari(b, penanda, hariLiburMingguan);
}

module.exports = { keMenit, berlakuPadaHari, shiftPada, sifatHari, setara, tanggalLokal };
