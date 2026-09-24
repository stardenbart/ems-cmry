-- Deskripsi peran bawaan dalam bahasa Inggris, seragam dengan UI.
-- Hanya menimpa yang masih berisi teks bawaan migrasi 010; deskripsi yang
-- sudah diubah admin dari UI tidak disentuh.
UPDATE roles SET description = 'Full access including system settings'
 WHERE name = 'admin' AND description = 'Akses penuh termasuk pengaturan sistem';
UPDATE roles SET description = 'Configure devices and alarms'
 WHERE name = 'maintenance' AND description = 'Konfigurasi perangkat dan alarm';
UPDATE roles SET description = 'Monitor and acknowledge alarms'
 WHERE name = 'operator' AND description = 'Memantau dan mengakui alarm';
UPDATE roles SET description = 'View only'
 WHERE name = 'viewer' AND description = 'Hanya melihat';
