// src/services/emailService.ts
import nodemailer from 'nodemailer';
import crypto from 'crypto';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    const config: EmailConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
      }
    };

    this.transporter = nodemailer.createTransport(config);
  }

  /**
   * Generar token de verificación
   */
  generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generar fecha de expiración (24 horas)
   */
  generateExpirationDate(): Date {
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + 24);
    return expiration;
  }

  /**
   * Enviar email de verificación
   */
  async sendVerificationEmail(
    email: string, 
    username: string, 
    token: string
  ): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/auth/verify-email?token=${token}`;
    
    const mailOptions = {
      from: `"Caballeros Cósmicos" <${process.env.SMTP_USER}>`,
      to: email,
      subject: '🏛️ Confirma tu cuenta en Caballeros Cósmicos',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Verificación de Email</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚡ ¡Bienvenido a Caballeros Cósmicos! ⚡</h1>
            </div>
            <div class="content">
              <h2>¡Hola ${username}!</h2>
              <p>Gracias por registrarte en <strong>Caballeros Cósmicos</strong>, el juego de cartas inspirado en Saint Seiya.</p>
              
              <p>Para activar tu cuenta y comenzar tu aventura en el Santuario, necesitas verificar tu dirección de correo electrónico.</p>
              
              <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">
                  🏛️ Verificar mi Email
                </a>
              </div>
              
              <p><strong>O copia y pega este enlace en tu navegador:</strong></p>
              <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">
                ${verificationUrl}
              </p>
              
              <p><strong>⏰ Este enlace expirará en 24 horas.</strong></p>
              
              <p>Si no creaste esta cuenta, puedes ignorar este email.</p>
              
              <p>¡Que los cosmos te acompañen!</p>
              <p><strong>El equipo de Caballeros Cósmicos</strong></p>
            </div>
            <div class="footer">
              <p>Este es un email automático, por favor no respondas.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email de verificación enviado a: ${email}`);
    } catch (error) {
      console.error('❌ Error enviando email:', error);
      throw new Error('Error enviando email de verificación');
    }
  }

  /**
   * Verificar configuración del transportador
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      console.log('✅ Conexión SMTP verificada');
      return true;
    } catch (error) {
      console.error('❌ Error en conexión SMTP:', error);
      return false;
    }
  }
}

export default new EmailService();