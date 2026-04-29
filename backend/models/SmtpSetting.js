const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SmtpSetting = sequelize.define('SmtpSetting', {
  host: {
    type: DataTypes.STRING(200),
  },
  port: {
    type: DataTypes.INTEGER,
    defaultValue: 465,
  },
  username: {
    type: DataTypes.STRING(200),
  },
  password: {
    type: DataTypes.STRING(200),
  },
}, {
  tableName: 'smtp_settings',
  timestamps: true,
  underscored: true,
  createdAt: false,
  updatedAt: 'updated_at',
});

module.exports = SmtpSetting;