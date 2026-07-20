/**
 * Email Service
 * Handles sending emails for password reset and notifications
 * Requirements: 11.1, 11.2, 11.6, 11.7, 11.10, 11.12
 */
import logger from '../../../config/logger';
import { IEmailService } from '../../domain/services/IEmailService';

// Note: nodemailer will be installed separately
// import nodemailer from 'nodemailer';
// import type { Transporter } from 'nodemailer';

export class EmailService implements IEmailService {
  private transporter: any | null = null;
  private readonly appUrl: string;
  private readonly emailFrom: string;

  constructor() {
    this.appUrl = process.env.APP_URL || 'http://localhost:5173';
    this.emailFrom = process.env.EMAIL_FROM || 'noreply@afvisitorsystem.com';

    if (this.isConfigured()) {
      this.initializeTransporter();
    }
  }

  /**
   * Check if email service is properly configured
   * Requirement: 11.2
   */
  isConfigured(): boolean {
    return !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD
    );
  }

  /**
   * Initialize nodemailer transporter
   * Requirement: 11.1
   */
  private initializeTransporter(): void {
    try {
      // This will be uncommented when nodemailer is installed
      /*
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });
      */
      logger.info('Email service configured successfully');
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
      this.transporter = null;
    }
  }

  /**
   * Send password reset email with token
   * Requirements: 11.6, 11.7
   */
  async sendPasswordResetEmail(to: string, token: string, username: string): Promise<void> {
    if (!this.isConfigured() || !this.transporter) {
      throw new Error('Email service is not configured');
    }

    const resetLink = `${this.appUrl}/reset-password?token=${token}`;

    const subject = 'Password Reset Request - AF Visitor System';
    const html = this.getPasswordResetTemplate(username, resetLink);
    const text = this.getPasswordResetTextTemplate(username, resetLink);

    try {
      // This will be uncommented when nodemailer is installed
      /*
      await this.transporter.sendMail({
        from: this.emailFrom,
        to,
        subject,
        text,
        html
      });
      */
      logger.info(`Password reset email would be sent to ${to}`);
      logger.debug(`Reset link: ${resetLink}`);
    } catch (error) {
      logger.error('Failed to send password reset email:', error);
      // Requirement: 11.12 - Don't expose technical details
      throw new Error('Failed to send email. Please try again later.');
    }
  }

  /**
   * Send password changed confirmation email
   * Requirement: 11.10
   */
  async sendPasswordChangedEmail(to: string, username: string): Promise<void> {
    if (!this.isConfigured() || !this.transporter) {
      // Silently fail if email is not configured
      logger.debug('Email service not configured, skipping password changed notification');
      return;
    }

    const subject = 'Password Changed Successfully - AF Visitor System';
    const html = this.getPasswordChangedTemplate(username);
    const text = this.getPasswordChangedTextTemplate(username);

    try {
      // This will be uncommented when nodemailer is installed
      /*
      await this.transporter.sendMail({
        from: this.emailFrom,
        to,
        subject,
        text,
        html
      });
      */
      logger.info(`Password changed email would be sent to ${to}`);
    } catch (error) {
      logger.error('Failed to send password changed email:', error);
      // Don't throw - this is a notification, not critical
    }
  }

  /**
   * Get HTML template for password reset email
   * Requirement: 11.7
   */
  private getPasswordResetTemplate(username: string, resetLink: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Request</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
    <h2 style="color: #2c3e50; margin-top: 0;">Password Reset Request</h2>
    
    <p>Hello <strong>${username}</strong>,</p>
    
    <p>You have requested to reset your password for the AF Visitor System.</p>
    
    <p>Click the button below to reset your password:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetLink}" 
         style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
        Reset Password
      </a>
    </div>
    
    <p>Or copy and paste this link into your browser:</p>
    <p style="background-color: #fff; padding: 10px; border-radius: 3px; word-break: break-all;">
      ${resetLink}
    </p>
    
    <p><strong>This link will expire in 15 minutes.</strong></p>
    
    <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 20px 0;">
      <p style="margin: 0;"><strong>⚠️ Security Notice:</strong></p>
      <p style="margin: 5px 0 0 0;">If you did not request this password reset, please ignore this email and your password will remain unchanged.</p>
    </div>
    
    <p>For security reasons, we recommend:</p>
    <ul>
      <li>Using a strong, unique password</li>
      <li>Not sharing your password with anyone</li>
      <li>Changing your password regularly</li>
    </ul>
    
    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
    
    <p style="color: #7f8c8d; font-size: 12px;">
      Best regards,<br>
      AF Visitor System Team
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Get plain text template for password reset email
   */
  private getPasswordResetTextTemplate(username: string, resetLink: string): string {
    return `
Password Reset Request - AF Visitor System

Hello ${username},

You have requested to reset your password for the AF Visitor System.

Click the link below to reset your password:
${resetLink}

This link will expire in 15 minutes.

⚠️ SECURITY NOTICE:
If you did not request this password reset, please ignore this email and your password will remain unchanged.

For security reasons, we recommend:
- Using a strong, unique password
- Not sharing your password with anyone
- Changing your password regularly

Best regards,
AF Visitor System Team
    `.trim();
  }

  /**
   * Get HTML template for password changed confirmation
   * Requirement: 11.10
   */
  private getPasswordChangedTemplate(username: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Changed Successfully</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
    <h2 style="color: #27ae60; margin-top: 0;">✓ Password Changed Successfully</h2>
    
    <p>Hello <strong>${username}</strong>,</p>
    
    <p>Your password has been changed successfully.</p>
    
    <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 10px; margin: 20px 0;">
      <p style="margin: 0;">Your account is now secured with your new password.</p>
    </div>
    
    <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 20px 0;">
      <p style="margin: 0;"><strong>⚠️ Security Alert:</strong></p>
      <p style="margin: 5px 0 0 0;">If you did not make this change, please contact your system administrator immediately.</p>
    </div>
    
    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
    
    <p style="color: #7f8c8d; font-size: 12px;">
      Best regards,<br>
      AF Visitor System Team
    </p>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Get plain text template for password changed confirmation
   */
  private getPasswordChangedTextTemplate(username: string): string {
    return `
Password Changed Successfully - AF Visitor System

Hello ${username},

Your password has been changed successfully.

Your account is now secured with your new password.

⚠️ SECURITY ALERT:
If you did not make this change, please contact your system administrator immediately.

Best regards,
AF Visitor System Team
    `.trim();
  }
}

// Export singleton instance
export const emailService = new EmailService();
