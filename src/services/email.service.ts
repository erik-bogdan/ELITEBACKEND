import nodemailer from 'nodemailer';
import { render } from '@react-email/render';

export type SendEmailOptions = {
  to: string;
  subject: string;
  html?: string;
  react?: JSX.Element;
  text?: string;
  from?: string;
};

export class EmailService {
  static createTransport() {
    const host = process.env.SMTP_HOST || 'localhost';
    const port = Number(process.env.SMTP_PORT || 1025);
    const secure = String(process.env.SMTP_SECURE || 'false') === 'true';
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    return nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined });
  }

  static async send(options: SendEmailOptions) {
    const transporter = EmailService.createTransport();
    const from = options.from || process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@sorpingpong.hu';
    const html = options.html || (options.react ? await render(options.react) : undefined);
    const info = await transporter.sendMail({ from, to: options.to, subject: options.subject, html, text: options.text });
    return { messageId: info.messageId };
  }
}


