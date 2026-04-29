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
  group_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
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