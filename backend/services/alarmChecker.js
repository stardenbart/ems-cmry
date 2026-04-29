const { Alarm, AlarmLog, Device } = require('../models');
const { sendAlarmEmail } = require('./emailService');

// Cooldown: mencegah alarm yang sama terpicu berulang-ulang
// Key: alarm_id, Value: timestamp terakhir terpicu
const alarmCooldowns = {};
const COOLDOWN_MS = 5 * 60 * 1000; // 5 menit cooldown

async function checkAlarms(deviceId, data) {
  try {
    const alarms = await Alarm.findAll({
      where: { device_id: deviceId, enabled: true },
    });

    const device = await Device.findByPk(deviceId);
    const deviceName = device ? device.name : `Device ${deviceId}`;

    for (const alarm of alarms) {
      const conditions = alarm.conditions || [];
      if (conditions.length === 0) continue;

      let allTriggered = true;

      for (const cond of conditions) {
        const value = data[cond.parameter];
        if (value === null || value === undefined) {
          allTriggered = false;
          break;
        }

        let condMet = false;
        switch (cond.operator) {
          case 'greater':
            condMet = value > parseFloat(cond.threshold);
            break;
          case 'less':
            condMet = value < parseFloat(cond.threshold);
            break;
          case 'equal':
            condMet = value === parseFloat(cond.threshold);
            break;
          case 'greaterEqual':
            condMet = value >= parseFloat(cond.threshold);
            break;
          case 'lessEqual':
            condMet = value <= parseFloat(cond.threshold);
            break;
          default:
            condMet = false;
        }

        if (!condMet) {
          allTriggered = false;
          break;
        }
      }

      if (allTriggered) {
        // Cek cooldown
        const lastTriggered = alarmCooldowns[alarm.id];
        const now = Date.now();
        if (lastTriggered && (now - lastTriggered) < COOLDOWN_MS) {
          continue; // Masih dalam cooldown, skip
        }

        alarmCooldowns[alarm.id] = now;

        // Simpan ke alarm_logs
        await AlarmLog.create({
          alarm_id: alarm.id,
          device_name: deviceName,
          alarm_name: alarm.alarm_name,
          triggered_at: new Date(),
          message: alarm.message,
        });

        // Kirim email
        if (alarm.mail_to) {
          sendAlarmEmail(alarm.mail_to, alarm.alarm_name, alarm.message, deviceName);
        }

        console.log(`ALARM: ${alarm.alarm_name} triggered for ${deviceName}`);
      }
    }
  } catch (err) {
    console.error('Error checking alarms:', err.message);
  }
}

module.exports = { checkAlarms };