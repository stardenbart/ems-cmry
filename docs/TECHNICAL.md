# EMS — Dokumentasi Teknis

Panduan handover untuk engineer maupun AI agent yang baru masuk ke repo ini.
Dokumen ini menjelaskan cara sistem bekerja, konvensi yang tidak terlihat dari kode,
dan jebakan yang sudah pernah memakan korban.

Terakhir diperbarui: 2026-09-24.

---

## 1. Ringkasan

Energy Monitoring System (EMS) membaca power meter **Schneider PM2200** lewat RS485 /
Modbus RTU, menyiarkannya ke browser secara realtime, menyimpan sampel tiap 15 menit ke
PostgreSQL, lalu menyajikan dashboard energi.

**Stack:** Node 18 · Express · Sequelize · PostgreSQL 17 · React (CRA) · ws · modbus-serial · node-cron

---

## 2. Topologi runtime

```
PM2200 ──RS485/Modbus RTU──> COM2 (9600 8N1, slave ID 1)
   │
   ▼
modbusReader.js        poll tiap POLL_INTERVAL_MS (3000 ms)
   │                   baca semua param dari device_types.params
   │
   ├──> wsServer.broadcastData() ──> latestData{} (in-memory) ──> WebSocket :3005 ──> React
   ├──> alarmChecker.checkAlarms()
   │
   ▼
dataLogger.js          cron */15 * * * *
   │                   snapshot latestData -> filter save=true -> bulkCreate
   ▼
PostgreSQL `ems_db` ──> routes/dashboards.js (agregasi SQL) ──> REST :3010/api ──> React
```

Satu proses Node melayani **:3010** (REST API + static `frontend/build`) dan **:3005** (WebSocket).

### Deployment produksi

| Hal | Nilai |
|---|---|
| Server | `172.104.1.81` (Windows 11, host `DESKTOP-JTEQQKD`) |
| Path | `C:\Apps\ems-cmry` |
| Proses | **Windows Service `emsbackend.exe`** (node-windows), entry `backend/server.js` |
| Installer service | `backend/install-service.js`, artefak di `backend/daemon/` (tidak di-commit) |
| Log service | `backend/daemon/emsbackend.out.log` / `.err.log` |
| Frontend | build statis, di-serve Express — **bukan** `react-scripts start` |

> **pm2 tidak dipakai lagi.** Dulu ada entri pm2 `ems_backend` yang berjalan paralel dengan
> Windows Service dan crash-loop `EADDRINUSE :3005` sampai menghasilkan log 15 GB. Entri itu
> sudah dihapus 2026-09-24. Jangan dihidupkan lagi — pilih salah satu, jangan dua-duanya.

---

## 3. Skema database

9 tabel. Relasi didefinisikan di `backend/models/index.js`.

```
groups ─┐
        ├─< devices >─┬─ device_types   (params JSONB = peta register)
gateways┘             └─ data_gateways  (COM port, baudrate, parity)
                │
                └─< readings   (device_id, timestamp, parameter, value)
                └─< alarms ─< alarm_logs

users · energy_conversions · smtp_settings
```

`readings` adalah tabel panjang (EAV): satu baris per parameter per timestamp, bukan satu
baris per pembacaan. Kolom `timestamp` bertipe **`timestamptz`**; koneksi Sequelize memakai
`timezone: '+07:00'`, dan semua agregasi memakai `AT TIME ZONE 'Asia/Jakarta'`.

Konfigurasi terpasang saat ini: 1 device `PM MDP-A3` (slave 1), 1 gateway `MDP A-3` (COM2),
1 device type `PM2200` berisi 24 parameter.

---

## 4. Peta register PM2200 — baca ini sebelum menyentuh mapping

Peta register **tidak ada di kode**. Semuanya tersimpan di kolom JSONB
`device_types.params` dan bisa diedit dari UI **Settings → Data Mapping**. Ini artinya
perilaku pembacaan bisa berubah tanpa satu baris kode pun berubah — dan itu sudah pernah
terjadi.

Bentuk tiap entri:

```json
{ "name": "Active Power Total", "address": 3059, "length": 2, "dataType": "float32be", "save": true }
```

| Field | Arti |
|---|---|
| `address` | alamat Modbus 0-based yang dikirim ke `readHoldingRegisters` |
| `length` | jumlah register (2 untuk float32, 4 untuk int64) |
| `dataType` | `float32be` · `int16` · `uint16` · `int32` · `int64-be` |
| `save` | kalau `false`, parameter tetap tampil realtime tapi tidak ditulis ke `readings` |

### Konvensi alamat

**`address` = nomor register di manual − 1.**

| Parameter | Manual | `address` |
|---|---|---|
| Current A | 3000 | 2999 |
| Active Power Total | 3060 | 3059 |
| Apparent Power Total | 3076 | 3075 |
| Power Factor A | 3078 | **3077** |
| Frequency | 3110 | 3109 |
| Active Energy Delivered (Into Load) | 3204 | 3203 (int64, length 4) |

Kalau menambah parameter, ikuti pola ini dan **verifikasi terhadap data hidup**, jangan
percaya manual saja — lihat §6.

### Catatan Power Factor

Ada dua besaran berbeda dan keduanya valid:

| `address` | Nilai tipikal di plant ini | Arti |
|---|---|---|
| 3084 | ~0,66 | PF total — persis sama dengan `Active Power / Apparent Power` |
| **3077** | ~0,96 | Power Factor A (displacement PF fasa A) — **yang dipakai sekarang** |

Selisihnya besar karena THD arus tinggi (~17–18%). PF total (true PF) memperhitungkan
harmonisa, displacement PF tidak. Per permintaan 2026-09-24 sistem memakai **3077**.

Nama parameternya tetap `PF Total` walau isinya Power Factor A, supaya riwayat
`readings` lama tidak terputus dan key WebSocket di frontend tidak berubah. Judul kartu
di UI sudah diubah jadi "Power Factor A".

---

## 5. Perhitungan energi

### Sumber

Register akumulator `Active Energy Delivered (Into Load)` (int64, satuan **Wh**) adalah
sumber utama. Kalau belum ada datanya, `dashboards.js` jatuh ke estimasi
`SUM(Active Power Total) × 0,25` (karena interval log 15 menit = 0,25 jam).

### Energy per periode — jumlah selisih, bukan MAX − MIN

`energyQuery()` di `backend/routes/dashboards.js` menjumlahkan **selisih positif antar
pembacaan berurutan**:

```sql
SUM(GREATEST(0, value - LAG(value) OVER (ORDER BY timestamp))) / 1000
```

Ini menggantikan rumus lama `MAX(value) - MIN(value)`. Alasannya: **akumulator meter bisa
di-reset**. Pada 1 Sep 2026 10:00 WIB nilainya terjun dari 2.022.839.359 Wh ke 4.499 Wh,
dan rumus MAX−MIN menghitung seluruh angka sebelum reset sebagai pemakaian satu hari —
2.026.830 kWh, padahal normalnya ~18.000 kWh/hari. `GREATEST(0, ...)` membuang langkah
negatif saat reset.

Helper ini dipakai bersama oleh `/energy` dan `/comparison`. Jangan duplikasi rumusnya lagi.

### Konsekuensi yang perlu diketahui

Kalau logging sempat berhenti, energi selama jeda akan **dilimpahkan ke hari saat logging
kembali jalan**, karena selisih pertama setelah jeda menjembatani seluruh periode itu.
Contoh nyata: jeda 3 hari 18 jam berakhir 20 Sep 19:00 WIB → 64.915 kWh masuk ke bucket
20 Sep. Total bulanan tetap benar, distribusi hariannya yang melar. Ini artefak jeda data,
bukan bug rumus — rumus lama justru menghilangkan energi itu sama sekali.

### Energy Today

`GET /api/dashboards/energy-today` mengembalikan nilai akumulator pertama hari ini
(sudah dalam kWh). Frontend menghitung `nilai_realtime / 1000 − base` supaya kartu
ikut bergerak realtime, bukan menunggu cron 15 menit.

> Batasnya: kalau meter di-reset di tengah hari berjalan, angka Energy Today akan kacau
> sampai lewat tengah malam. Belum ditangani.

---

## 6. Jebakan yang sudah pernah menggigit

### 6.1 Frame Modbus tergeser dan tidak pernah resync

Ini penyebab insiden 23–24 Sep 2026 dan paling penting untuk dipahami.

`connectRTUBuffered` memakai buffer. Kalau satu pembacaan timeout, balasan yang datang
terlambat tertinggal di buffer, lalu **dimakan oleh permintaan berikutnya**. Semua register
setelah itu bergeser satu posisi, dan koneksi tidak pernah di-reset sendiri. Akibatnya:

- `Active Energy Delivered` terbaca **tepat ×65536** selama 21 jam (nilai benar digeser 16 bit)
- `PF Total` jadi `null`
- Nilai-nilai lain tetap terlihat "masuk akal" sehingga tidak ada yang curiga

Gejalanya berhenti hanya saat proses di-restart. Perbaikannya ada di
`backend/services/modbusReader.js`: `readDevice()` kini mengembalikan
`{ data, failed }`, dan `pollAllDevices()` **menutup lalu menyambung ulang koneksi begitu ada
satu register pun gagal dibaca**, serta tidak menyiarkan data dari siklus tersebut.

> Kalau melihat nilai akumulator melonjak dengan faktor pas 2ⁿ, curigai hal ini duluan,
> bukan alamat registernya.

### 6.2 `reloadConfig()` tidak pernah dipanggil

`modbusReader.js` mengekspor `reloadConfig()`, tapi **tidak ada satu pun pemanggilnya**.
`routes/settings.js` mengubah `device_types` tanpa memberi tahu reader. Artinya:

**Setiap perubahan Data Mapping baru berlaku setelah service di-restart.**

Ini membuat kerusakan bisa muncul berhari-hari setelah seseorang mengedit mapping, sehingga
sulit dihubungkan dengan penyebabnya. Kalau mau diperbaiki, panggil `reloadConfig()` dari
handler `PUT /api/settings/device-types`.

### 6.3 Diagnosis mapping wajib pakai data hidup

Saat menebak alamat register, jangan berhenti di manual. Verifikasi silang:

- `Active Power Total / Apparent Power Total` harus sama dengan PF total
- akumulator energi harus naik monoton, dan `Δenergi / Δwaktu` harus ≈ `Active Power Total`
- `Frequency` harus ~50 Hz, `Voltage L-L` ~398 V

Contoh nyata mengapa ini penting: `PF Total` pernah dipetakan ke 3109 — alamat Frequency —
sehingga nilainya terbaca `50,0218`, identik dengan Frequency. Ketahuan hanya lewat
perbandingan seperti di atas.

### 6.4 Probe serial dari sesi SSH tidak bisa diandalkan

Membaca COM2 langsung dari skrip Node lewat sesi SSH menghasilkan timeout di semua register,
padahal service (berjalan sebagai LocalSystem) membacanya normal. Untuk diagnosis, andalkan
`GET /api/dashboards/realtime-all` dan isi tabel `readings`, bukan probe manual.

---

## 7. API

Semua endpoint butuh header `Authorization: Bearer <token>` dari `POST /api/auth/login`.

| Endpoint | Fungsi |
|---|---|
| `GET /api/dashboards/realtime-all` | snapshot `latestData` in-memory — alat diagnosis utama |
| `GET /api/dashboards/realtime/:deviceId` | idem, satu device |
| `GET /api/dashboards/energy-today?device_id=` | base akumulator hari ini (kWh) |
| `GET /api/dashboards/energy?device_id=&range=today\|thisWeek\|thisMonth\|thisYear` | energi per bucket |
| `GET /api/dashboards/comparison?device_id=&range=…VsLast…` | periode berjalan vs sebelumnya |
| `GET /api/dashboards/power?device_id=&start=&end=` | trend kW |
| `GET /api/dashboards/pq?device_id=&start=&end=` | THD arus & tegangan |
| `GET /api/dashboards/group/energy\|comparison\|kva` | agregasi per group |
| `GET /api/dashboards/energy-conversion` | faktor CO2 / fuel / IDR per kWh |

`/api/auth`, `/api/devices`, `/api/reports`, `/api/alarms`, `/api/settings` mengikuti pola CRUD biasa.

---

## 8. Menjalankan secara lokal

```bash
git clone https://github.com/stardenbart/ems-cmry.git
cd ems-cmry
psql -U postgres -c "CREATE DATABASE ems_db;"
psql -U postgres -d ems_db -f backend/database/structure_ems.sql

cd backend  && npm install && node seed.js && npm run dev
cd frontend && npm install && npm start
```

`.env` tidak ikut repo. Template ada di `README.md`. Tanpa hardware, `modbusReader`
otomatis masuk **DEMO MODE** dengan data simulasi — nama parameternya harus persis sama
dengan yang di `device_types.params`, kalau tidak dashboard akan kosong.

---

## 9. Runbook operasional

```powershell
# status & restart
Get-Service emsbackend.exe
Restart-Service emsbackend.exe -Force     # wajib setelah mengubah Data Mapping

# apakah meter menjawab?  semua nilai null = link RS485 mati
# (login dulu, lalu GET /api/dashboards/realtime-all)

# log
Get-Content C:\Apps\ems-cmry\backend\daemon\emsbackend.out.log -Tail 40

# backup DB
& 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe' -U postgres -d ems_db -f C:\Apps\backup\ems_db.sql
```

**Checklist saat angka dashboard terlihat aneh:**

1. `realtime-all` — semua `null`? → link RS485 / hardware, bukan software
2. Bandingkan `Active Power / Apparent Power` dengan `PF Total`
3. Cek akumulator energi monoton naik dan ordenya wajar (~4×10⁸ Wh per 2026-09-24)
4. Lonjakan dengan faktor 2ⁿ → frame tergeser, restart service (§6.1)
5. Bucket harian melar → cek jeda logging (§5)
6. Baru terakhir: curigai `device_types.params`

---

## 10. Utang teknis yang diketahui

| Hal | Dampak |
|---|---|
| `reloadConfig()` tidak dipanggil | perubahan mapping butuh restart manual (§6.2) |
| `frontend/src/api/axios.js` hardcode `http://172.104.1.81:3010/api` | pindah server = wajib rebuild frontend; kembalikan ke `REACT_APP_API_URL` |
| Password default `admin/admin` masih aktif | risiko keamanan |
| Energy Today rusak kalau meter reset di tengah hari | §5 |
| Jeda logging melarkan bucket harian | §5 |
| Tidak ada test otomatis | perubahan formula energi hanya terverifikasi manual |
