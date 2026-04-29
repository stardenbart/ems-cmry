const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DeviceType = sequelize.define('DeviceType', {
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING(50),
    defaultValue: 'Power Meter',
  },
  params: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
}, {
  tableName: 'device_types',
  timestamps: true,
  underscored: true,
});

module.exports = DeviceType;