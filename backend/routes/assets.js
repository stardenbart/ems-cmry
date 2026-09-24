const router = require('express').Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const tree = require('../services/assetTree');
const agg = require('../services/aggregation');
const audit = require('../services/audit');

// GET /api/assets/tree — seluruh pohon beserta jumlah device per node.
router.get('/tree', authenticate, async (req, res) => {
  try {
    const nodes = await sequelize.query(`
      SELECT a.id, a.parent_id, a.name, a.type, a.sort_order,
             (SELECT COUNT(*) FROM devices d WHERE d.asset_node_id = a.id) AS device_count
        FROM asset_nodes a ORDER BY a.parent_id NULLS FIRST, a.sort_order, a.name`,
      { type: QueryTypes.SELECT });
    res.json(nodes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/nodes', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const { parent_id, name, type, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [row] = await sequelize.query(`
      INSERT INTO asset_nodes (parent_id, name, type, sort_order)
      VALUES (:parent_id, :name, :type, :sort_order) RETURNING *`, {
      replacements: {
        parent_id: parent_id || null, name,
        type: type || 'Area', sort_order: sort_order || 0,
      }, type: QueryTypes.SELECT,
    });
    await audit.record(req, { action: 'create', entity: 'asset_node', entityId: row.id, after: row });
    res.status(201).json(row);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/nodes/:id', authenticate, authorize('admin', 'maintenance'), async (req, res) => {
  try {
    const [before] = await sequelize.query('SELECT * FROM asset_nodes WHERE id = :id',
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
    if (!before) return res.status(404).json({ error: 'Node not found' });

    // Node tidak boleh jadi induk dirinya sendiri, maupun induk dari leluhurnya:
    // menelusuri ke atas dari induk baru tidak boleh bertemu node ini.
    const pindah = Object.prototype.hasOwnProperty.call(req.body, 'parent_id');
    if (pindah && req.body.parent_id !== null && req.body.parent_id !== '') {
      let kini = Number(req.body.parent_id);
      const dilihat = new Set();
      while (kini && !dilihat.has(kini)) {
        if (kini === Number(req.params.id)) {
          return res.status(400).json({ error: 'A node cannot be moved under itself or one of its children' });
        }
        dilihat.add(kini);
        const [atas] = await sequelize.query('SELECT parent_id FROM asset_nodes WHERE id = :id',
          { replacements: { id: kini }, type: QueryTypes.SELECT });
        kini = atas ? atas.parent_id : null;
      }
    }

    const [row] = await sequelize.query(`
      UPDATE asset_nodes SET
        parent_id  = CASE WHEN :pindah THEN :parent_id ELSE parent_id END,
        name       = COALESCE(:name, name),
        type       = COALESCE(:type, type),
        sort_order = COALESCE(:sort_order, sort_order),
        updated_at = now()
      WHERE id = :id RETURNING *`, {
      replacements: {
        id: req.params.id,
        pindah,
        // parent_id null berarti dipindah ke tingkat teratas, bukan "tidak berubah".
        parent_id: pindah && req.body.parent_id !== '' ? req.body.parent_id : null,
        name: req.body.name ?? null,
        type: req.body.type ?? null,
        sort_order: req.body.sort_order ?? null,
      }, type: QueryTypes.SELECT,
    });
    await audit.record(req, { action: 'update', entity: 'asset_node', entityId: row.id, before, after: row });
    res.json(row);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/nodes/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [anak] = await sequelize.query(
      'SELECT COUNT(*) AS n FROM asset_nodes WHERE parent_id = :id',
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
    if (Number(anak.n) > 0) {
      return res.status(400).json({ error: 'This node still has children; move or delete them first' });
    }
    const [dev] = await sequelize.query(
      'SELECT COUNT(*) AS n FROM devices WHERE asset_node_id = :id',
      { replacements: { id: req.params.id }, type: QueryTypes.SELECT });
    if (Number(dev.n) > 0) {
      return res.status(400).json({ error: 'Devices are still placed in this node; move them first' });
    }
    await sequelize.query('DELETE FROM asset_nodes WHERE id = :id', { replacements: { id: req.params.id } });
    await audit.record(req, { action: 'delete', entity: 'asset_node', entityId: req.params.id });
    res.json({ message: 'Node deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/assets/:id/overview?range=today
//
// Ringkasan satu node dan seluruh cabang di bawahnya. Aturan agregasinya
// diturunkan dari metadata: counter dijumlahkan antar device, gauge dirata-rata.
// Satuan berbeda tidak pernah digabung.
// ────────────────────────────────────────────────────────────────────────────
router.get('/:id/overview', authenticate, async (req, res) => {
  try {
    const nodeId = req.params.id === 'root' ? await tree.rootNode() : parseInt(req.params.id);
    if (!nodeId) return res.status(404).json({ error: 'Node not found' });

    const range = req.query.range || 'today';
    const { devices, mode, nodes } = await tree.devicesForRollup(nodeId);

    // Kumpulkan metadata parameter per device type sekali saja.
    const typeIds = [...new Set(devices.map((d) => d.device_type_id))];
    const types = typeIds.length === 0 ? [] : await sequelize.query(
      'SELECT id, params FROM device_types WHERE id IN (:ids)',
      { replacements: { ids: typeIds }, type: QueryTypes.SELECT });
    const paramsByType = {};
    types.forEach((t) => {
      paramsByType[t.id] = typeof t.params === 'string' ? JSON.parse(t.params) : (t.params || []);
    });

    // Kelompokkan menurut besaran dan satuan.
    //
    // HANYA parameter ber-flag featured yang masuk ringkasan. Mengelompokkan
    // seluruh parameter hanya dari kind dan unit menghasilkan angka yang
    // menyesatkan: arus akan merata-ratakan A, B, C, N, dan Avg sekaligus —
    // netral ikut terhitung dan Avg terhitung dua kali — sementara tegangan
    // mencampur L-L (~403 V) dengan L-N (~232 V) menjadi ~316 V yang tidak
    // berarti apa pun. featured memang disediakan untuk memilih wakil tiap
    // besaran, dan bisa diatur dari Data Mapping tanpa menyentuh kode.
    const buckets = {};
    for (const d of devices) {
      const params = paramsByType[d.device_type_id] || [];
      const wakil = params.filter((p) => p.featured === true && p.save !== false);
      // Perangkat yang belum punya penanda featured sama sekali tidak
      // disembunyikan; seluruh parameternya dipakai sebagai cadangan.
      const dipakai = wakil.length > 0 ? wakil : params.filter((p) => p.save !== false);

      for (const p of dipakai) {
        const key = `${p.kind || 'other'}|${p.unit || '-'}|${p.agg || 'gauge'}`;
        (buckets[key] = buckets[key] || { kind: p.kind, unit: p.unit, agg: p.agg, items: [] })
          .items.push({ device: d, parameter: p.name });
      }
    }

    const ringkasan = [];
    for (const b of Object.values(buckets)) {
      let total = 0;
      let jumlahNilai = 0;
      let suspect = 0;
      let ikut = 0;

      for (const it of b.items) {
        const rows = await agg.aggregate({
          device_id: it.device.id, parameter: it.parameter,
          agg: b.agg === 'counter' ? 'counter' : 'gauge', range,
        });
        if (rows.length === 0) continue;
        ikut++;
        suspect += rows.reduce((s, r) => s + Number(r.suspect_count || 0), 0);

        if (b.agg === 'counter') {
          total += rows.reduce((s, r) => s + Number(r.total || 0), 0);
        } else {
          const rata = rows.reduce((s, r) => s + Number(r.total || 0), 0) / rows.length;
          total += rata;
          jumlahNilai++;
        }
      }

      if (ikut === 0) continue;
      ringkasan.push({
        kind: b.kind, unit: b.unit, agg: b.agg,
        // counter dijumlah antar device, gauge dirata-rata. Menjumlahkan suhu
        // dari beberapa sensor akan menghasilkan angka yang tidak berarti.
        value: b.agg === 'counter' ? total : (jumlahNilai ? total / jumlahNilai : null),
        deviceCount: ikut,
        suspectCount: suspect,
      });
    }

    res.json({
      node: nodes[0],
      range,
      rollupMode: mode,
      deviceCount: devices.length,
      nodeCount: nodes.length,
      summary: ringkasan,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
