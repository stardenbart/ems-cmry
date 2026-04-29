const nodemailer = require('nodemailer');
const SmtpSetting = require('../models/SmtpSetting');

async function sendAlarmEmail(to, alarmName, message, deviceName) {
  try {
    const smtp = await SmtpSetting.findOne({ order: [['id', 'DESC']] });
    if (!smtp || !smtp.host || !smtp.username) {
      console.log('SMTP belum dikonfigurasi, skip kirim email');
      return;
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: {
        user: smtp.username,
        pass: smtp.password,
      },
    });

    await transporter.sendMail({
      from: `"EMS Alarm" <${smtp.username}>`,
      to,
      subject: `[EMS ALARM] ${alarmName} - ${deviceName}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #c0392b;">⚠ Alarm Triggered</h2>
          <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 8px; font-weight: bold;">Alarm:</td><td style="padding: 8px;">${alarmName}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Device:</td><td style="padding: 8px;">${deviceName}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Message:</td><td style="padding: 8px;">${message}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Time:</td><td style="padding: 8px;">${new Date().toLocaleString('id-ID')}</td></tr>
          </table>
          <p style="color: #7f8c8d; margin-top: 20px;">Digital Transformation - Plant Sentul</p>
        </div>
      `,
    });

    console.log(`Alarm email sent to ${to}`);
  } catch (err) {
    console.error('Gagal kirim email alarm:', err.message);
  }
}

async function sendTestEmail(to) {
  const smtp = await SmtpSetting.findOne({ order: [['id', 'DESC']] });
  if (!smtp || !smtp.host) throw new Error('SMTP belum dikonfigurasi');

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: {
      user: smtp.username,
      pass: smtp.password,
    },
  });

  await transporter.sendMail({
    from: `"EMS System" <${smtp.username}>`,
    to,
    subject: '[EMS] Test Email',
    html: '<h3>Test email berhasil!</h3><p>Konfigurasi SMTP sudah benar.</p>',
  });

  return true;
}

module.exports = { sendAlarmEmail, sendTestEmail };