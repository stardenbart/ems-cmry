const WebSocket = require('ws');

let wss = null;
const latestData = {};

function startWebSocket(server) {
  const WS_PORT = process.env.WS_PORT || 3005;

  wss = new WebSocket.Server({ port: WS_PORT });

  wss.on('connection', (ws, req) => {
    console.log(`WebSocket client connected (total: ${wss.clients.size})`);

    // Kirim semua data terbaru saat client baru connect
    ws.send(JSON.stringify({
      type: 'init',
      data: latestData,
      timestamp: new Date().toISOString(),
    }));

    ws.on('close', () => {
      console.log(`WebSocket client disconnected (total: ${wss.clients.size})`);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  });

  console.log(`WebSocket server running on port ${WS_PORT}`);
}

function broadcastData(deviceId, data) {
  latestData[deviceId] = {
    ...data,
    _timestamp: new Date().toISOString(),
  };

  if (wss) {
    const message = JSON.stringify({
      type: 'realtime',
      deviceId,
      data,
      timestamp: new Date().toISOString(),
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

function broadcastAlarm(alarmData) {
  if (wss) {
    const message = JSON.stringify({
      type: 'alarm',
      data: alarmData,
      timestamp: new Date().toISOString(),
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

function getLatestData() {
  return latestData;
}

module.exports = { startWebSocket, broadcastData, broadcastAlarm, getLatestData };