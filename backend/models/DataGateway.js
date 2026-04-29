const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DataGateway = sequelize.define('DataGateway', {
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  protocol: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'modbus-rtu',
  },
  port_or_ip: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  baudrate: {
    type: DataTypes.INTEGER,
    defaultValue: 9600,
  },
  parity: {
    type: DataTypes.STRING(10),
    defaultValue: 'even',
  },
}, {
  tableName: 'data_gateways',
  timestamps: true,
  underscored: true,
});

module.exports = DataGateway;