# EMS — Dokumentasi Teknis

Panduan handover untuk engineer maupun AI agent yang baru masuk ke repo ini.
Isinya cara sistem bekerja, konvensi yang tidak terlihat dari kode, dan jebakan
yang sudah pernah memakan korban.

Terakhir diperbarui: 2026-09-24.

---

## 1. Ringkasan

Platform monitoring industri yang membaca perangkat lewat Modbus RTU/TCP,
menyiarkannya realtime, menyimpan sampel tiap 15 menit, dan menyajikan dashboard
yang menyesuaikan diri dengan jenis besaran apa pun.

Awalnya khusus energi dengan satu Schneider PM2200. Sekarang generik: pressure,
temperature, flow, dan besaran lain tidak memerlukan kode baru — cukup metadata.

**Stack:** Node 18 · Express · Sequelize · PostgreSQL 17 · React (CRA) · ws ·
modbus-serial · node-cron

---

## 2. Prinsip yang memegang seluruh desain

Empat aturan ini menjelaskan hampir semua keputusan di kode. Kalau ragu saat
mengubah sesuatu, kembali ke sini.

**Perilaku ditentukan metadata, bukan nama parameter.** Tidak ada satu pun
halaman atau query yang menyebut "Active Power Total" secara langsung. Yang
menentukan adalah `kind`, `agg`, dan `unit` milik parameter.

**Simpan mentah, konversi saat dibaca.** Nilai di `readings` adalah angka apa
adanya. Membetulkan faktor yang salah otomatis membetulkan seluruh riwayat,
tanpa `UPDATE` massal.

**`name` adalah identitas, `label` adalah tampilan.** Kolom `parameter` di
`readings` menautkan jutaan baris ke parameternya. Mengganti `name` memutus
tautan itu, jadi nama tampilan disimpan terpisah di `label`.

**Aturan otomatis harus benar-benar mustahil, bukan sekadar tidak biasa.**
Validasi yang terlalu ketat menghasilkan penanda palsu, dan penanda palsu membuat
orang berhenti mempercayai seluruh sistem.

---

## 3. Topologi runtime

```
Perangkat Modbus (RTU di COM2, TCP lewat gateway)
   │
   ▼
modbusReader.js            poll tiap POLL_INTERVAL_MS (3000 ms)
   │  block read, kelas laju, resync saat gagal baca
   ├──> decode.js          penyandian khusus perangkat (int64, pf_ieee, manual)
   ├──> wsServer           latestData{} in-memory ──> WebSocket :3005 ──> React
   ├──> watchdog           tandai pembacaan sukses
   │
   ▼
dataLogger.js              cron */15 * * * *
   │  validasi rentang + koherensi -> quality; spool saat DB mati
   ▼
PostgreSQL ──> aggregation.js ──> REST :3010/api ──> React
                                    ▲
alarmEngine.js (timer 5 detik) ─────┘  baca latestData, nyalakan alarm_events
```

Satu proses Node melayani **:3010** (REST + static `frontend/build`) dan
**:3005** (WebSocket).

### Deployment

| Hal | Nilai |
|---|---|
| Server | `172.104.1.81` (Windows 11, `DESKTOP-JTEQQKD`) |
| Path | `C:\Apps\ems-cmry` |
| Proses | Windows Service **`emsbackend.exe`** (node-windows) |
| Log | `backend/daemon/emsbackend.out.log` / `.err.log` |
| Backup DB | `C:\Apps\backup\`, task **EMS DB Backup** tiap 01:00 (SYSTEM), simpan 14 hari, log di `backup.log` |
| Waktu | w32time sinkron ke `pool.ntp.org` / `time.windows.com` (sebelum 24 Sep 2026 tidak pernah sinkron, meleset 3,5 detik) |

> **pm2 sudah dicabut total** pada 24 Sep 2026 — app dihapus, daemon di-kill,
> entri Run `PM2` dibuang. Dulu berjalan paralel dengan Windows Service, crash
> loop `EADDRINUSE :3005`, dan menghasilkan log 16,4 GB yang memenuhi disk lalu
> menjatuhkan server. Jangan dihidupkan lagi.

---

## 4. Migrasi database

Project ini punya runner migrasi sendiri tanpa dependensi baru.

```bash
npm run migrate:status   # lihat mana yang sudah diterapkan
npm run migrate          # terapkan yang belum
```

Berkas `.sql` dan `.js` bernomor di `backend/database/migrations`, dijalankan
urut nama, dicatat di `schema_migrations`, masing-masing dalam satu transaksi.

| # | Isi |
|---|---|
| 001 | index `readings`, kolom `quality`, `collector_id` |
| 002 | tabel `units` + 24 satuan bawaan |
| 003 | metadata semantik untuk parameter yang ada |
| 004 | `audit_log` |
| 005 | penanda password bawaan |
| 006 | tabel `parameters` + `parameter_id` |
| 007 | `asset_nodes`, `devices.asset_node_id`, `devices.role` |
| 008 | `alarm_rules`, `alarm_events`, `email_templates` |
| 009 | `shifts`, `calendar_days` |
| 010 | `roles`, `role_capabilities`, `user_roles`, `token_version` |
| 011 | JUMO LOGOSCREEN 601 UHT 5000: node, tipe, gateway simulasi, device |
| 012 | deskripsi peran bawaan dalam bahasa Inggris |
| 013 | arsipkan 673 baris PF Total mustahil (-32,768 dan 50,022), PF Total diurutkan sebelum PF per fasa |
| 014 | 20 baris era alamat 3077 diberi nama PF A (koreksi jendela waktu 013) |

**Selalu backup sebelum migrasi.** `node backup.js` memakai kredensial dari
`.env` tanpa mencetaknya.

---

## 5. Metadata parameter

Peta register tersimpan di `device_types.params` (JSONB) dan disunting lewat
**Settings → Data Mapping**. Jumlahnya tidak dibatasi — batas Modbus adalah 125
register per satu permintaan baca, bukan jumlah parameter, dan RS485 tidak
mengenal konsep parameter sama sekali.

```json
{
  "name": "Active Power Total", "label": "Daya Aktif",
  "address": 3059, "length": 2, "dataType": "float32be", "save": true,
  "kind": "power", "unit": "kW", "agg": "gauge", "precision": 2,
  "conv_mode": "none", "scale": 1, "offset": 0,
  "min": -5000, "max": 5000,
  "featured": true, "order": 0, "poll_class": "fast"
}
```

| Field | Pengaruhnya |
|---|---|
| `agg` | `counter` = jumlah selisih positif · `gauge` = rata-rata. Menentukan seluruh agregasi |
| `kind` | memilih ikon, mengelompokkan dashboard, memilih aturan koherensi |
| `unit` | label dan konversi; harus ada di tabel `units` |
| `conv_mode` | `none` · `manual` (scale/offset) · `pf_ieee` (lipat PF) |
| `min`/`max` | batas kewajaran; di luar itu ditandai `quality = 1` |
| `featured` | tampil sebagai kartu KPI |
| `poll_class` | `fast` tiap siklus · `normal` tiap 2 · `slow` tiap 10 |
| `label` | nama di kartu; kosong berarti pakai `name` |

### Konvensi alamat

`address` = nomor register di manual − 1. Current A 3000→2999, Active Power
Total 3060→3059, Frequency 3110→3109.

**Jangan percaya manual saja.** Pakai tombol **Read** di Data Mapping: sistem
membaca register itu dari perangkat dan menampilkan hasil dekode untuk semua
tipe data sekaligus. Verifikasi silang yang selalu berlaku:

- `Apparent Power ≈ √3 × Voltage L-L × Current Avg / 1000`
- `PF Total = Active Power / Apparent Power`
- akumulator energi naik monoton, dan `Δenergi/Δwaktu ≈ Active Power`

### Power factor PM2200

Register PF berkisar **−2..2**, bukan −1..1. Nilai di atas 1 berarti *leading*
(kapasitif) dan harus dilipat: `1,304 → −0,696`. Itu tugas `conv_mode: pf_ieee`.
Tanpa pelipatan, layar menampilkan 1,304 — angka yang mustahil untuk PF.

| Alamat | Parameter |
|---|---|
| 3077 | PF A |
| 3079 | PF B |
| 3081 | PF C |
| 3083 | PF Total |

---

## 6. Agregasi

`services/aggregation.js` memilih rumus dari `agg`, bukan dari nama parameter.

**`counter`** — jumlah selisih positif antar pembacaan, **disebar proporsional
sepanjang waktunya** lewat `generate_series`.

Dua hal ditangani sekaligus. `GREATEST(0, …)` membuang langkah negatif saat meter
di-reset (1 Sep 2026 nilainya terjun dari 2.022.839.359 Wh ke 4.499 Wh).
Penyebaran proporsional menjaga total tetap utuh saat ada jeda logging: versi yang
membuang selisih penjembatan pernah kehilangan **3.340 dari 14.492 kWh dalam satu
hari**, sementara versi yang menimbunnya di satu bucket pernah membuat satu hari
terbaca 67.958 kWh.

**`gauge`** — avg, min, max. Tidak pernah dijumlah. Menjumlahkan suhu dari
beberapa sensor menghasilkan angka yang tidak berarti.

Baris ber-`quality` suspect **tidak disembunyikan**; jumlahnya dilaporkan lewat
`suspect_count` supaya UI bisa menandainya tanpa menghilangkan datanya.

---

## 7. Hierarki aset dan rollup

`asset_nodes` adalah pohon dengan kedalaman bebas; `type` teks bebas (Plant,
Gedung, Line, Mesin). Device menempel ke node mana pun lewat `asset_node_id`,
bukan hanya daun — meter incomer gedung menempel ke node gedung, meter mesin ke
node mesin.

`devices.role` menentukan rollup:

| role | Perlakuan |
|---|---|
| `incomer` | node memakai angka ini saja sebagai totalnya |
| `feeder` | dijumlahkan bersama seluruh cabang di bawah node |
| `excluded` | tidak pernah ikut |

Tanpa aturan ini, panel utama dan sub-panelnya terhitung dua kali. Selisih
`incomer − Σ feeder` ditampilkan sebagai temuan, bukan disembunyikan: isinya rugi
distribusi, beban yang belum dimeter, dan kesalahan pemasangan CT.

Diatur lewat **Settings → Asset Hierarchy**. Menu **Grouping** lama masih ada tapi
sudah peninggalan.

---

## 8. Kualitas data

Empat lapis, semuanya lahir dari kejadian nyata.

1. **Resync Modbus.** Timeout meninggalkan balasan telat di buffer
   `connectRTUBuffered`; permintaan berikutnya memakannya dan seluruh register
   bergeser satu posisi. Energi pernah terbaca **tepat ×65536 selama 21 jam**.
   Sekarang koneksi di-reset begitu ada satu register gagal dibaca.
2. **Validasi rentang** terhadap `min`/`max`.
3. **Validasi koherensi** antar parameter — hanya yang mustahil secara fisika.
4. **Watchdog dua lapis**: realtime 2 menit per device, logging 2× interval.
5. **Circuit breaker per device** (`services/circuitBreaker.js`): 3 kegagalan
   berturut-turut → device dilewati 30 detik, berlipat sampai 5 menit. Tanpa ini
   satu device mati di bus RS485 memperlambat semua device lain di bus itu.
   **Read** manual dan **Test** di Data Gateway tetap menembus.

### Overview: satu wakil per device per besaran

Overview memakai kartu **featured pertama (menurut `order`) tiap besaran** dari
setiap device, bukan seluruh parameter featured. Featured juga dipakai kartu
KPI, sehingga satu PM2200 punya PF A, B, C, dan Total sekaligus — merata-ratakan
keempatnya pernah menghasilkan Power Factor 1,60 (24 Sep 2026; sebagian karena
riwayat PF Total tercemar, lihat migrasi 013/014). Setiap kartu menyebut device
dan parameter wakilnya.

> Jebakan waktu: `timestamp AT TIME ZONE 'Asia/Jakarta'` menghasilkan jam dinding
> WIB tanpa zona, dan driver Node mencetaknya dengan akhiran `Z`. Angka itu
> **bukan UTC**. Migrasi 013 meleset 7 jam karena ini.

### Aturan koherensi harus konservatif

Versi pertama menandai `√(P²+Q²)` yang jauh di bawah `S`, dan arus netral yang
melebihi arus fasa tertinggi. Keduanya ternyata **sah** pada beban tiga fasa tak
seimbang, dan menghasilkan tujuh parameter suspect palsu di produksi.

`Apparent Power Total` adalah jumlah **aritmetik** per fasa, sementara
`√(P²+Q²)` adalah jumlah **vektor**. Untuk beban tak seimbang keduanya berbeda
jauh. Fasa yang seimbang besarnya juga bisa sangat tidak seimbang sudutnya, dan
harmonisa triplen menjumlah di netral.

Yang tersisa hanya empat aturan yang benar-benar mustahil: `S_vs_VI`, `P_gt_S`,
`PQ_gt_S`, dan `IN_gt_sum` (arus netral melebihi **jumlah** ketiga fasa).

---

## 9. Konfigurasi tanpa restart

Perubahan mapping berlaku pada siklus pembacaan berikutnya. `requestReload()`
menandai permintaan, dan `pollAllDevices()` memuat ulang **di batas siklus** —
bukan di tengah pembacaan, karena menukar peta register di tengah siklus adalah
cara termudah membuat frame Modbus tergeser.

`POST /api/devices/:id/read-now` memaksa satu pembacaan agar hasilnya langsung
terlihat. Keduanya lewat antrean per gateway, jadi tidak pernah bertabrakan
dengan poll yang sedang jalan.

### Gateway simulasi

Gateway ber-protocol `simulated` membangkitkan nilai dari metadata parameter
(`services/simulator.js`) lalu melewati jalur yang sama persis dengan device
sungguhan: broadcast, dataLogger, agregasi, alarm, watchdog. Bentuk kurvanya
diatur blok opsional `sim` pada parameter — `nominal`, `swing`, dan `rate`
(kenaikan per jam untuk `agg: counter`). Tanpa `sim`, titik tengahnya ditebak
dari `min`/`max`.

Begitu perangkat fisik tersambung, ubah protocol gateway ke `modbus-rtu` atau
`modbus-tcp` dari **Settings → Data Gateway**. Device yang sama langsung menarik
data asli; riwayat pembacaannya tetap di bawah `device_id` yang sama.

> Pembacaan dari masa simulasi tetap tersimpan di `readings`. Kalau angka dummy
> itu tidak boleh ikut laporan, hapus berdasarkan `device_id` dan rentang waktu
> sebelum tanggal peralihan.

### JUMO LOGOSCREEN 601 — UHT 5000

Dipasang lewat migrasi 011 di `Plant Sentul › Gedung CMD 1 › UHT 5000`, lima kanal
suhu `TT02`, `TT05`, `TT06`, `TT09`, `TT07B` (`kind: temperature`, `unit: degC`).

Dari data sheet 70652100T10Z001K000: maksimal 6 analog input universal (Pt100,
Pt1000, termokopel, mA, V), satu port RS232/RS485 SUB-D 9 pin yang bisa dipilih,
baud 4800–115200, format 8/1n, 8/1e, 8/1o, Modbus RTU sebagai **master atau
slave**, dan Modbus TCP lewat Ethernet.

**Yang perlu dilakukan sebelum pindah dari simulasi:**

1. Set perekam sebagai **Modbus slave** di menu interface-nya, catat slave
   address, baud, dan parity. Isi `address` device dengan slave address itu.
2. Alamat register di migrasi 011 (`0, 2, 4, 6, 8`, float32be) **masih
   sementara**. Data sheet tidak memuat peta registernya — itu ada di dokumen
   *Interface Description Modbus* LOGOSCREEN 600-series. Pastikan dengan tombol
   **Read** di Data Mapping: angka yang terbaca harus sama dengan layar perekam.
3. Kalau urutan kata floatnya terbalik, hasil `float32le_wordswap` di Read yang
   akan cocok — ganti `dataType` sesuai itu.

---

## 10. Alarm

`alarm_rules` dirakit dari UI: parameter, operator, ambang, `hold_seconds`,
severity, jendela aktif harian, penerima, template.

`hold_seconds` membuat kondisi harus bertahan sebelum alarm menyala. Tanpa itu
satu lonjakan sesaat sudah cukup membangunkan orang tengah malam, dan alarm yang
terlalu berisik akhirnya diabaikan — sama saja dengan tidak punya alarm.

`alarmEngine.js` berjalan di **timer sendiri tiap 5 detik**, bukan menempel di
jalur pembacaan Modbus: satu email yang menggantung tidak boleh memperlambat
polling bus.

---

## 11. Peran dan hak akses

**Katalog kapabilitas ditetapkan di kode** (`services/capabilities.js`), bukan
database, karena setiap kapabilitas harus punya titik penegakan nyata. Yang bebas
dirakit dari UI adalah kombinasinya menjadi peran.

Penugasan terikat node dan berlaku ke seluruh cabang di bawahnya. Mencabut peran
menaikkan `users.token_version`, yang membuat token lama tidak berlaku — JWT
bersifat stateless, jadi tanpa ini kewenangan lama masih bisa dipakai sampai
token kedaluwarsa.

> **Jangan menegakkan aturan tanpa alur UI-nya siap.** Guard `must_change_password`
> pernah menolak seluruh endpoint dengan 428; interceptor frontend membacanya
> sebagai sesi kedaluwarsa dan melempar user ke halaman login. Seluruh halaman
> kosong, dan itu memadamkan sistem, bukan mengamankannya.

### Ganti password wajib

Akun ber-`must_change_password` hanya boleh memanggil `/auth/me` dan
`/auth/change-password`; endpoint lain menjawab **428**, dan interceptor
frontend mengarahkannya ke `/change-password?required=1`. Ganti password
mengembalikan token baru, karena token lama masih membawa penandanya.
Password yang diketik admin — user baru maupun reset — otomatis wajib diganti
pemiliknya saat login pertama.

---

## 12. Menjalankan dan memelihara

```bash
# lokal
psql -U postgres -c "CREATE DATABASE ems_db;"
cd backend  && npm install && npm run migrate && node seed.js && npm run dev
cd frontend && npm install && npm start

# test — tanpa database maupun perangkat
npm test
npm run test:db     # perlu koneksi database
```

### Build produksi

**Selalu lewat `backend/buildswap.ps1`.** CRA mengosongkan folder tujuan sebelum
mengisinya, jadi build langsung ke `build/` membuat website membalas error
beberapa detik, dan build yang gagal meninggalkan situs kosong. Skrip itu
membangun ke folder sementara dan menukarnya hanya kalau berhasil.

```powershell
Get-Service emsbackend.exe
Restart-Service emsbackend.exe -Force
Get-Content C:\Apps\ems-cmry\backend\daemon\emsbackend.out.log -Tail 40
```

### Pulih sendiri setelah server mati

`emsbackend.exe` bergantung pada `postgresql-x64-17` (tidak start sebelum database
siap), dan keduanya disetel **restart otomatis saat gagal** (10 s, 30 s, 60 s;
hitungan di-reset tiap 24 jam). Start type keduanya Automatic. Yang tidak bisa
diatur dari software: opsi BIOS *Restore on AC power loss* supaya PC menyala
sendiri setelah listrik kembali.

### Aplikasi desktop

EMS dipasang lewat **Install this site as an app** di Edge/Chrome (manifest di
`frontend/public/manifest.json`, ikon `ems-icon-*.png`). Peluncur exe di
`desktop/` **tidak disajikan**: Smart App Control Windows 11 memblokir exe tanpa
tanda tangan kode tanpa pilihan "Run anyway". Layak dibagikan lagi hanya setelah
ditandatangani sertifikat code signing perusahaan.

### User Guide

Halaman `/guide` (`frontend/src/pages/UserGuide.js`) memakai screenshot di
`frontend/public/guide/`. Ambil ulang setiap tampilan berubah:

```
set EMS_GUIDE_USER=<admin>
set EMS_GUIDE_PASSWORD=<password>
python tools/guide_screenshots.py frontend/public/guide
```

### Checklist saat angka terlihat aneh

1. `GET /api/dashboards/realtime-all` — semua `null`? berarti link fisik, bukan software
2. Bandingkan `Active/Apparent` dengan `PF Total`
3. Akumulator energi monoton naik dan ordenya wajar?
4. Lonjakan dengan faktor 2ⁿ → frame tergeser, restart service
5. `npm run test:db` — menangkap regresi rumus energi
6. Baru terakhir: curigai `device_types.params`, dan lihat **audit log** siapa yang mengubahnya

---

## 13. Utang teknis yang diketahui

| Hal | Dampak |
|---|---|
| `admin/admin` masih aktif di produksi | alur UI ganti password wajib sudah siap (24 Sep 2026); tinggal diaktifkan dengan `node check-default-passwords.js` |
| HTTP polos, tanpa TLS | kredensial melintas terbuka di jaringan pabrik |
| WebSocket menyiarkan semua device ke semua client | boros; belum mendesak karena pemakaian 1–5 user |
| `RealtimeDevice` dan `DeviceDetail` tumpang tindih | dua halaman melakukan hal serupa |
| Tabel `groups` masih ada | peninggalan, digantikan `asset_nodes` |
| Cakupan test tipis di lapisan integrasi | bug overview pernah lolos seluruh test unit dan baru ketahuan dari data nyata |
| Docker memakai 102 GB di server | pembersihan ditunda atas permintaan |

---

## 14. Temuan kelistrikan yang belum ditindaklanjuti

Bukan masalah software, tapi nyata dan berbiaya. Terbaca dari meter 24 Sep 2026:

| | Daya aktif | Daya reaktif | PF |
|---|---|---|---|
| Fasa A | 338,6 kW | +98,9 kvar | 0,96 |
| Fasa B | 139,8 kW | +351,3 kvar | **0,37** |
| Fasa C | 270,2 kW | **−278,8 kvar** | 0,70 leading |

Kompensasi daya reaktif tidak seimbang antar fasa: fasa B nyaris tanpa koreksi,
fasa C kelebihan sampai berbalik kapasitif. PF total **0,67** kemungkinan besar
sudah kena denda kVArh PLN tiap bulan. Ketidakseimbangan sudut ini juga yang
menjelaskan arus netral ~3.000 A padahal arus fasa ~1.600 A — besaran yang
berisiko memanaskan konduktor netral.

Perlu diperiksa teknisi listrik: bank kapasitor per fasa, dan pengukuran langsung
di panel.
