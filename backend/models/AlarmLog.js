const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AlarmLog = sequelize.define('AlarmLog', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  alarm_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  device_name: {
    type: DataTypes.STRING(100),
  },
  alarm_name: {
    type: DataTypes.STRING(100),
  },
  triggered_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  message: {
    type: DataTypes.TEXT,
  },
  acknowledged_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  acknowledged_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
}, {
  tableName: 'alarm_logs',
  timestamps: false,
});

module.exports = AlarmLog;