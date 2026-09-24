const express = require('express');
const cors = require('cors');
const path = require('path');
const { sequelize } = require('./models');
const { startWebSocket } = require('./websocket/wsServer');
const { startModbusReader } = require('./services/modbusReader');
const { startDataLogger } = require('./services/dataLogger');
const { startWatchdog } = require('./services/watchdog');
const { startAlarmEngine } = require('./services/alarmEngine');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3010',
    'http://172.104.1.81:3000',
    'http://172.104.1.81:3010'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/devices', require('./routes/devices'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/dashboards', require('./routes/dashboards'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/alarms', require('./routes/alarms'));
app.use('/api/settings', require('./routes/settings'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend build (production only)
app.use(express.static(path.join(__dirname, '../frontend/build')));

app.get('*splat', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3010;

sequelize.authenticate()
  .then(() => {
    console.log('Database connected');
    return sequelize.sync({ alter: false });
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log('=================================');
      console.log(`EMS Backend running on port ${PORT}`);
      console.log('=================================');

      // Start services
      startWebSocket();
      startModbusReader();
      startDataLogger();
      startWatchdog();
      startAlarmEngine();
    });
  })
  .catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });