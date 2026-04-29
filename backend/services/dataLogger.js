const cron = require('node-cron');
const { Reading, Device, DeviceType } = require('../models');
const { getLatestData } = require('../websocket/wsServer');

// Configurable via .env: LOG_INTERVAL_MINUTES=15
const INTERVAL = parseInt(process.env.LOG_INTERVAL_MINUTES) || 15;

function buildCronExpression(minutes) {
  if (minutes <= 0 || minutes > 60) return '*/15 * * * *';
  return `*/${minutes} * * * *`;
}

function startDataLogger() {
  const cronExp = buildCronExpression(INTERVAL);

  cron.schedule(cronExp, async () => {
    try {
      const latestData = getLatestData();
      if (Object.keys(latestData).length === 0) return;

      const timestamp = new Date();
      const records = [];

      // Load devices and build maps
      const devices = await Device.findAll({
        include: [{ model: DeviceType, as: 'deviceType' }],
      });

      // Set of valid device IDs in the database (used to prevent FK violation)
      const validDeviceIds = new Set(devices.map((d) => d.id));

      const deviceTypeMap = {};
      devices.forEach((d) => {
        if (d.deviceType) {
          const params = typeof d.deviceType.params === 'string'
            ? JSON.parse(d.deviceType.params)
            : (d.deviceType.params || []);
          deviceTypeMap[d.id] = params;
        }
      });

      for (const [deviceIdStr, data] of Object.entries(latestData)) {
        const deviceId = parseInt(deviceIdStr);

        // ─── CRITICAL: skip if device_id not in DB (prevents FK violation) ───
        if (!validDeviceIds.has(deviceId)) {
          console.warn(`[DataLogger] Skipping unknown device_id=${deviceId} (not in devices table)`);
          continue;
        }

        const params = deviceTypeMap[deviceId] || [];
        const saveParams = params.filter((p) => p.save === true).map((p) => p.name);

        for (const [parameter, value] of Object.entries(data)) {
          // Skip metadata fields sent alongside readings
          if (['deviceName', 'deviceId', '_timestamp'].includes(parameter)) continue;

          // Only save parameters that are flagged save=true in device type config
          if (saveParams.length > 0 && !saveParams.includes(parameter)) continue;

          // Skip null/undefined/NaN
          if (value === null || value === undefined || isNaN(value)) continue;

          const numVal = parseFloat(value);

          // Guard against negative energy accumulator values (sensor glitch)
          if (parameter.toLowerCase().includes('energy') && numVal < 0) {
            console.warn(`[DataLogger] Skipping negative energy value: ${parameter}=${numVal} for device_id=${deviceId}`);
            continue;
          }

          records.push({ device_id: deviceId, timestamp, parameter, value: numVal });
        }
      }

      if (records.length > 0) {
        await Reading.bulkCreate(records);
        console.log(`[DataLogger] ✓ Saved ${records.length} readings at ${timestamp.toLocaleString('id-ID')}`);
      } else {
        console.log(`[DataLogger] No valid readings to save at ${timestamp.toLocaleString('id-ID')}`);
      }
    } catch (err) {
      console.error('[DataLogger] Error:', err.message);
    }
  });

  console.log(`[DataLogger] Started — saving every ${INTERVAL} minute(s) (cron: ${cronExp})`);
}

module.exports = { startDataLogger };