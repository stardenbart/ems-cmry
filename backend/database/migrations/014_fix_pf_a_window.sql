-- Koreksi langkah 1 migrasi 013: jendela waktunya meleset 7 jam.
--
-- Rentang waktu di 013 dibaca dari query yang mengembalikan jam dinding WIB,
-- lalu keliru diperlakukan sebagai UTC, sehingga 013 tidak mengubah satu baris
-- pun di langkah itu (dicek 24 Sep 2026: PF A tetap 12 baris, PF Total masih
-- memuat nilai 0,96). Era alamat 3077 yang sebenarnya:
--   24 Sep 2026 08:15 - 13:00 UTC  (15:15 - 20:00 WIB), 20 baris bernilai 0,96.
-- PF Total asli sesudah peralihan dimulai 13:15 UTC, di luar jendela ini, dan
-- nilainya ~0,67 sehingga tidak tersentuh saringan 0,9-1,0.
UPDATE readings r
   SET parameter = 'PF A',
       parameter_id = (SELECT id FROM parameters WHERE name = 'PF A')
 WHERE r.parameter = 'PF Total'
   AND r.value BETWEEN 0.9 AND 1
   AND r.timestamp >= '2026-09-24 08:00:00+00'
   AND r.timestamp <  '2026-09-24 13:10:00+00';
