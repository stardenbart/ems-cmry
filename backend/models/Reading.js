const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Reading = sequelize.define('Reading', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  device_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  parameter: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  value: {
    type: DataTypes.DOUBLE,
    allowNull: true,
  },
  // 0 = good, 1 = suspect (gagal validasi rentang atau koherensi), 2 = estimated
  quality: {
    type: DataTypes.SMALLINT,
    allowNull: false,
    defaultValue: 0,
  },
}, {
  tableName: 'readings',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = Reading;