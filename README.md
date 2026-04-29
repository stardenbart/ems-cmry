# Energy Monitoring System (EMS)

Sistem monitoring energi berbasis web untuk membaca data real-time dari power meter Schneider PM2200 melalui komunikasi RS485/Modbus RTU.

**Stack:** Node.js · Express · PostgreSQL · Sequelize · React · WebSocket · Modbus RTU

---

## Prasyarat

Pastikan software berikut sudah terinstall di server/PC:

- [Node.js](https://nodejs.org) v18 atau lebih baru
- [PostgreSQL](https://www.postgresql.org) v14 atau lebih baru
- npm (sudah include dengan Node.js)

---

## 1. Clone Repository

```bash
git clone https://github.com/stardenbart/ems-cmry.git
cd ems-cmry
```

---

## 2. Buat Database PostgreSQL

Buka terminal PostgreSQL:

```bash
psql -U postgres
```

Jalankan perintah berikut:

```sql
CREATE DATABASE ems_db;
\q
```

> 📄 Skema lengkap database (semua tabel dan relasi) tersedia di `backend/database/structure_ems.sql` import ke database ems_db yang sudah dibuat.

---

## 3. Konfigurasi Environment Variables

### Backend — buat file `backend/.env`

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ems_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# Server
PORT=3004
WS_PORT=3005

# Auth
JWT_SECRET=your_jwt_secret_key_here

# Polling interval real-time (ms)
LOG_INTERVAL_MINUTES=15
POLL_INTERVAL_MS=3000
```

### Frontend — buat file `frontend/.env`

```env
REACT_APP_API_URL=http://localhost:3004/api
REACT_APP_WS_URL=ws://localhost:3005
```

> ⚠️ File `.env` tidak ikut di repository karena alasan keamanan. Buat manual sesuai template di atas.

---

## 4. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

---

## 5. Jalankan Seed Database

Seed akan membuat tabel, user default, device type PM2200, gateway, dan data awal lainnya.

```bash
cd backend
node seed.js
```

Output yang diharapkan:
```
Database connected
[Users] Created: admin
[Users] Created: maintenance
[Users] Created: operator
[Users] Created: viewer
[Groups] Created: ALL
[Gateways] Created: MDP A-3
[DeviceTypes] Created: PM2200 (24 params)
[Devices] Created: PM MDP-A3 (address: 1)
[EnergyConversion] Created default values
[SMTP] Created default
══════════════════════════════════
  Seed completed!
══════════════════════════════════
```

---

## 6. Jalankan Sistem

Buka **2 terminal terpisah**:

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm start
```

Akses website di browser: **http://localhost:3000**

---

## 7. Login Default

| Username | Password | Level |
|---|---|---|
| `admin` | `admin` | Admin — akses penuh |
| `maintenance` | `maintenance` | Maintenance |
| `operator` | `operator` | Operator |
| `viewer` | `viewer` | View only |

> ⚠️ Ganti password default setelah login pertama melalui **Settings → Users**.

---

## 8. Konfigurasi Hardware (Power Meter Fisik)

Untuk menghubungkan power meter fisik via RS485:

1. Install driver USB converter (CH340 atau CP2102) sesuai chip converter
2. Cek nomor COM port di **Device Manager → Ports (COM & LPT)**
3. Pastikan setting Modbus di meter: **Slave ID 1, Baud 9600, Parity None, Stop Bits 1**
4. Restart backend

Jika hardware tidak terdeteksi atau tidak konek, sistem otomatis berjalan dalam **Demo Mode** menggunakan data simulasi.

---

## Struktur Project

```
ems-cmry/
├── backend/
│   ├── config/         # Koneksi database
│   ├── database/
│   │   └── structure.sql  # Referensi skema database (9 tabel)
│   ├── middleware/      # Auth middleware
│   ├── models/         # Sequelize models
│   ├── routes/         # API routes
│   ├── services/       # Modbus reader, alarm checker, data logger
│   ├── websocket/      # WebSocket server
│   ├── seed.js         # Database seeder
│   └── server.js       # Entry point
├── frontend/
│   └── src/
│       ├── api/        # Axios instance
│       ├── components/ # Reusable components
│       ├── hooks/      # Custom hooks (WebSocket)
│       └── pages/      # Halaman utama
└── .gitignore
```

---

## Port yang Digunakan

| Service | Port |
|---|---|
| Frontend (React) | 3000 |
| Backend API (Express) | 3004 |
| WebSocket | 3005 |
| PostgreSQL | 5432 |

Pastikan port-port ini tidak dipakai aplikasi lain di server.
