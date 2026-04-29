const sequelize = require('../config/database');
const Device = require('./Device');
const DataGateway = require('./DataGateway');
const DeviceType = require('./DeviceType');
const Group = require('./Group');
const Reading = require('./Reading');
const Alarm = require('./Alarm');
const AlarmLog = require('./AlarmLog');
const User = require('./User');
const EnergyConversion = require('./EnergyConversion');
const SmtpSetting = require('./SmtpSetting');

// === RELASI ===

// Device belongsTo Group
Device.belongsTo(Group, { foreignKey: 'group_id', as: 'group' });
Group.hasMany(Device, { foreignKey: 'group_id', as: 'devices' });

// Device belongsTo DeviceType
Device.belongsTo(DeviceType, { foreignKey: 'device_type_id', as: 'deviceType' });
DeviceType.hasMany(Device, { foreignKey: 'device_type_id' });

// Device belongsTo DataGateway
Device.belongsTo(DataGateway, { foreignKey: 'data_gateway_id', as: 'dataGateway' });
DataGateway.hasMany(Device, { foreignKey: 'data_gateway_id' });

// Reading belongsTo Device
Reading.belongsTo(Device, { foreignKey: 'device_id', as: 'device' });
Device.hasMany(Reading, { foreignKey: 'device_id' });

// Alarm belongsTo Device
Alarm.belongsTo(Device, { foreignKey: 'device_id', as: 'device' });
Device.hasMany(Alarm, { foreignKey: 'device_id' });

// AlarmLog belongsTo Alarm
AlarmLog.belongsTo(Alarm, { foreignKey: 'alarm_id', as: 'alarm' });
Alarm.hasMany(AlarmLog, { foreignKey: 'alarm_id' });

module.exports = {
  sequelize,
  Device,
  DataGateway,
  DeviceType,
  Group,
  Reading,
  Alarm,
  AlarmLog,
  User,
  EnergyConversion,
  SmtpSetting,
};