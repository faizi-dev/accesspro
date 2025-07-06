
import nodemailer from 'nodemailer';

interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function sendEmail({ to, subject, html }: MailOptions) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.SMTP_FROM_EMAIL) {
    console.error("SMTP environment variables are not set. Email not sent.");
    // In a real app, you might want to throw an error or handle this differently.
    // For this prototype, we'll log an error and succeed silently to not block UI.
    return { success: false, message: 'SMTP configuration is missing on the server.' };
  }

  const mailOptions = {
    from: `AssessPro <${process.env.SMTP_FROM_EMAIL}>`,
    to,
    subject,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send email:', error);
    return { success: false, message: error.message };
  }
}

    