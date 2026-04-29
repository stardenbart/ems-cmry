const router = require('express').Router();
const { Device, DataGateway, DeviceType, Group } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');

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
    res.json({ message: 'Device berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;