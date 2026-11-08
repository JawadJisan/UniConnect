import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

/**
 * Sends one email. With no SMTP_HOST (development only, env.ts enforces it in production)
 * the message is logged instead, so the verification and reset links can be copied from
 * the terminal.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (!transport) {
    logger.info(`[email:console] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  await transport.sendMail({ from: env.SMTP_FROM, ...mail });
}
