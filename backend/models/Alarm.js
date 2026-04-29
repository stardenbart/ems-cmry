const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Alarm = sequelize.define('Alarm', {
  device_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  alarm_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  conditions: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
  message: {
    type: DataTypes.TEXT,
  },
  mail_to: {
    type: DataTypes.STRING(200),
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'alarms',
  timestamps: true,
  underscored: true,
});

module.exports = Alarm;