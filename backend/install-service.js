const Service = require('node-windows').Service;

const svc = new Service({
  name: 'EMS Backend',
  description: 'Energy Monitoring System Backend',
  script: 'C:\\Apps\\ems-cmry\\backend\\server.js',
  nodeOptions: [],
  env: [
    { name: 'NODE_ENV', value: 'production' }
  ]
});

svc.on('install', () => {
  svc.start();
  console.log('Service installed and started.');
});

svc.install();