-- Bersihkan riwayat "PF Total" yang sebenarnya bukan PF Total.
--
-- Nama parameter sengaja dipertahankan setiap kali alamatnya dibetulkan (supaya
-- riwayat tidak putus), akibatnya baris dari era mapping yang salah ikut
-- tersimpan di bawah nama "PF Total". Overview 24 Sep 2026 menampilkan
-- Power Factor 1,60 karena itu. Isinya, dari penelusuran per rentang nilai:
--
--   Jun 11 - Sep 8, Sep 21 - sekarang   0,64-0,68   PF Total asli        -> dibiarkan
--   Sep 9 07:15 - Sep 24 06:30 WIB      -32,768     kode "tidak tersedia"
--                                        50,022     register Frequency   -> 673 baris
--   Sep 24 08:15 - 13:00 WIB            0,96        PF A (alamat 3077)   -> 20 baris
--
-- Tidak ada baris yang dihapus. Yang mustahil (PF di luar -1..1) dipindah ke
-- nama arsip, sehingga tidak ada query yang memakainya lagi tapi datanya tetap
-- bisa diperiksa. Yang sebenarnya PF A diberi nama yang benar: PF A belum punya
-- riwayat sebelum 24 Sep 13:15 WIB, jadi tidak ada baris yang bertabrakan.
-- Membalik migrasi ini cukup dengan mengganti namanya kembali.

INSERT INTO parameters (name) VALUES ('PF A'), ('PF Total (invalid mapping, archived)')
ON CONFLICT (name) DO NOTHING;

-- 1. Era alamat 3077: nilainya PF A.
UPDATE readings r
   SET parameter = 'PF A',
       parameter_id = (SELECT id FROM parameters WHERE name = 'PF A')
 WHERE r.parameter = 'PF Total'
   AND r.value BETWEEN 0.9 AND 1
   AND r.timestamp >= '2026-09-24 01:00:00+00'
   AND r.timestamp <  '2026-09-24 06:10:00+00';

-- 2. Nilai yang mustahil untuk power factor.
UPDATE readings r
   SET parameter = 'PF Total (invalid mapping, archived)',
       parameter_id = (SELECT id FROM parameters WHERE name = 'PF Total (invalid mapping, archived)'),
       quality = 1
 WHERE r.parameter = 'PF Total'
   AND (r.value < -1 OR r.value > 1);

-- 3. PF Total tampil sebelum PF per fasa. Overview memakai kartu featured
--    pertama tiap besaran sebagai wakil device, jadi urutan ini yang membuat
--    Overview menampilkan PF Total, bukan PF A.
UPDATE device_types dt
   SET params = (
         SELECT jsonb_agg(CASE WHEN e->>'name' = 'PF Total' THEN jsonb_set(e, '{order}', '4') ELSE e END ORDER BY ord)
           FROM jsonb_array_elements(dt.params) WITH ORDINALITY AS t(e, ord)),
       updated_at = now()
 WHERE dt.name = 'PM2200'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(dt.params) e WHERE e->>'name' = 'PF Total');
