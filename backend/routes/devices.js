const router = require('express').Router();
const { Device, DataGateway, DeviceType, Group } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { readDeviceNow, requestReload, compareReadStrategies } = require('../services/modbusReader');

// GET /api/devices - List semua devices
router.get('/', authenticate, async (req, res) => {
  try {
    const devices = await Device.findAll({
      include: [
        { model: Group, as: 'group', attributes: ['id', 'name'] },
        { model: DeviceType, as: 'deviceType', attributes: ['id', 'name'] },
        { model: DataGateway, as: 'dataGateway', attributes: ['id', 'name'] },
      ],
      order: [['id', 'ASC']],
    });
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devices/:id
/**router.get('/:id', authenticate, async (req, res) => {
  try {
    const device = await Device.findByPk(req.params.id, {
      include: [
        { model: Group, as: 'group' },
        { model: DeviceType, as: 'deviceType' },
        { model: DataGateway, as: 'dataGateway' },
      ],
    });
    if (!device) return res.status(404).json({ error: 'Device tidak ditemukan' });
    res.json(device);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
**/

// GET /api/devices - List semua devices
router.get('/', authenticate, async (req, res) => {
  try {
    // Debug: coba tanpa include dulu
    const raw = await Device.findAll({ raw: true });
    console.log('[DEBUG] Raw devices count:', raw.length);
    console.log('[DEBUG] Raw devices:', JSON.stringify(raw, null, 2));

    const devices = await Device.findAll({
      include: [
        { model: Group, as: 'group', attributes: ['id', 'name'] },
        { model: DeviceType, as: 'deviceType', attributes: ['id', 'name'] },
        { model: DataGateway, as: 'dataGateway', attributes: ['id', 'name'] },
      ],
      order: [['id', 'ASC']],
    });
    
    console.log('[DEBUG] Devices with include:', devices.length);
    res.json(devices);
  } catch (err) {
    console.error('[DEBUG] Error:', err.message);
    console.error('[DEBUG] Full error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devices
router.post('/', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const device = await Device.create(req.body);
    requestReload();
    res.status(201).json(device);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/devices/:id
router.put('/:id', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const device = await Device.findByPk(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device tidak ditemukan' });
    await device.update(req.body);
    requestReload();
    res.json(device);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/devices/:id
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const device = await Device.findByPk(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device tidak ditemukan' });
    await device.destroy();
    requestReload();
    res.json({ message: 'Device berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devices/:id/read-now
// Paksa satu pembacaan di luar jadwal siklus, lalu kembalikan hasilnya.
// Dipakai UI setelah menyimpan perubahan mapping supaya efeknya langsung terlihat
// tanpa menunggu siklus polling atau restart service.
router.post('/:id/read-now', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const device = await Device.findByPk(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device tidak ditemukan' });

    const data = await readDeviceNow(req.params.id);
    if (!data) {
      return res.status(503).json({
        error: 'Perangkat tidak menjawab, atau ada register yang gagal dibaca',
      });
    }
    res.json({ deviceId: device.id, data, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devices/:id/verify-blockread
// Bandingkan hasil block read dengan pembacaan per parameter. Dipakai untuk
// membuktikan block read aman pada perangkat nyata sebelum dipercaya.
router.post('/:id/verify-blockread', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    res.json(await compareReadStrategies(req.params.id));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/devices/:id/parameters
// Metadata parameter untuk merakit tampilan. Halaman device memakai ini supaya
// panel dipilih dari kind dan agg, bukan dari nama parameter yang ditulis di kode.
// Terbuka untuk semua level karena hanya berisi keterangan, bukan pengaturan.
router.get('/:id/parameters', authenticate, async (req, res) => {
  try {
    const [row] = await sequelize.query(`
      SELECT d.id, d.name AS device_name, d.address, d.role, d.asset_node_id,
             dt.name AS type_name, dt.params
        FROM devices d
        JOIN device_types dt ON dt.id = d.device_type_id
       WHERE d.id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.SELECT });

    if (!row) return res.status(404).json({ error: 'Device tidak ditemukan' });

    const params = typeof row.params === 'string' ? JSON.parse(row.params) : (row.params || []);

    res.json({
      id: row.id,
      name: row.device_name,
      address: row.address,
      role: row.role,
      assetNodeId: row.asset_node_id,
      typeName: row.type_name,
      parameters: params
        .map((p) => ({
          name: p.name,
          kind: p.kind || 'other',
          unit: p.unit || '-',
          agg: p.agg || 'gauge',
          precision: p.precision === undefined ? 2 : p.precision,
          min: p.min === undefined ? null : p.min,
          max: p.max === undefined ? null : p.max,
          featured: p.featured === true,
          order: p.order === undefined ? 999 : p.order,
          saved: p.save !== false,
        }))
        .sort((a, b) => (b.featured - a.featured) || (a.order - b.order) || a.name.localeCompare(b.name)),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;