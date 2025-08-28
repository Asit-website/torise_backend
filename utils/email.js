const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtpout.secureserver.net',
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: 'info@kusheldigi.com',
    pass: 'KRC@infokds',
  },
  from: 'info@kusheldigi.com',
  tls: {
    rejectUnauthorized: false,
  },
});

async function sendEmail(to, subject, html) {
  const mailOptions = {
    from: 'info@kusheldigi.com',
    to,
    subject,
    html,
  };
  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent to', to);
  } catch (err) {
    console.error('Error sending email:', err);
  }
}

module.exports = sendEmail; 