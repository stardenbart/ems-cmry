const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EnergyConversion = sequelize.define('EnergyConversion', {
  co2_per_kwh: {
    type: DataTypes.DOUBLE,
    defaultValue: 0.0,
  },
  fuel_per_kwh: {
    type: DataTypes.DOUBLE,
    defaultValue: 0.0,
  },
  cost_per_kwh: {
    type: DataTypes.DOUBLE,
    defaultValue: 0.0,
  },
}, {
  tableName: 'energy_conversions',
  timestamps: true,
  underscored: true,
  updatedAt: false,
  createdAt: 'created_at',
});

module.exports = EnergyConversion;