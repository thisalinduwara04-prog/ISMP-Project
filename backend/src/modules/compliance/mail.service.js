const nodemailer = require('nodemailer');
const env = require('../../config/env');

let transporter;

const getTransporter = () => {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
};

const sendReminder = async ({ to, subject, text }) => {
  const transport = getTransporter();
  if (!transport) throw new Error('Email delivery is not configured.');
  return transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
};

const sendReport = async ({ to, subject, text, filename, content, contentType }) => {
  const transport = getTransporter();
  if (!transport) throw new Error('Email delivery is not configured.');
  return transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text,
    attachments: [{ filename, content, contentType }],
  });
};

module.exports = { sendReminder, sendReport };
