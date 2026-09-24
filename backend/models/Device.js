const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Device = sequelize.define('Device', {
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  address: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  // Peninggalan pengelompokan datar satu tingkat. Digantikan asset_node_id,
  // dibiarkan supaya halaman lama tetap jalan selama perpindahan.
  group_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // Tempat device di pohon aset. Boleh menempel di node mana pun, bukan hanya
  // daun: meter incomer gedung menempel ke node gedung, meter mesin ke node mesin.
  asset_node_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // incomer  = mengukur seluruh node, dipakai sendirian sebagai total node
  // feeder   = bagian dari total, dijumlahkan bersama anak-anak node
  // excluded = tidak pernah ikut rollup (meter redundan atau uji coba)
  role: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'feeder',
  },
  device_type_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  data_gateway_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'devices',
  timestamps: true,
  underscored: true,
});

module.exports = Device;