// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Op } from 'sequelize';
import User from '../models/User';
import UserSession from '../models/UserSession';
import emailService from '../services/emailService';
import transactionService from '../services/transactionService';
import { assignStarterCards } from '../scripts/assignStarterCards';
import ProfileAvatar from '../models/ProfileAvatar';
import UserProfile from '../models/UserProfile';
import UserAvatarUnlock from '../models/UserAvatarUnlock';

const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_muy_segura';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password } = req.body;

    // Validaciones básicas
    if (!username || !email || !password) {
      res.status(400).json({ error: 'Todos los campos son requeridos' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }

    // Verificar si el usuario ya existe (case-insensitive)
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { email: { [Op.iLike]: email } },
          { username: { [Op.iLike]: username } }
        ]
      }
    });

    if (existingUser) {
      if (existingUser.email.toLowerCase() === email.toLowerCase()) {
        res.status(400).json({ error: 'El email ya está registrado' });
        return;
      }
      if (existingUser.username.toLowerCase() === username.toLowerCase()) {
        res.status(400).json({ error: 'El nombre de usuario ya existe' });
        return;
      }
      res.status(400).json({ error: 'El usuario o email ya existe' });
      return;
    }

    // Hash de la contraseña
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Generar token de verificación
    const verificationToken = emailService.generateVerificationToken();
    const verificationExpires = emailService.generateExpirationDate();

    // Crear usuario
    const user = await User.create({
      username,
      email,
      password_hash,
      currency: 400, // 4 sobres × 100 monedas = 400
      is_email_verified: false,
      email_verification_token: verificationToken,
      email_verification_expires: verificationExpires
    });

    // Enviar email de verificación
    try {
      await emailService.sendVerificationEmail(email, username, verificationToken);
    } catch (emailError) {
      console.error('Error enviando email de verificación:', emailError);
      // No fallar el registro si hay error en el email
    }

    // ✅ ASIGNAR CARTAS INICIALES
    await assignStarterCards(user.id);

    // ✅ ASIGNAR AVATARES POR DEFECTO
    try {
      // Obtener todos los avatares default activos
      const defaultAvatars = await ProfileAvatar.findAll({ where: { unlock_type: 'default', is_active: true } });
      if (defaultAvatars.length > 0) {
        // Crear perfil si no existe (debería no existir recién registrado)
        const mainAvatar = defaultAvatars[0];
        const userProfile = await UserProfile.create({
          user_id: user.id,
          avatar_image_id: mainAvatar.id
        });

        // Desbloquear todos los avatares default
        for (const avatar of defaultAvatars) {
          await UserAvatarUnlock.create({
            user_id: user.id,
            avatar_id: avatar.id,
            unlock_source: 'registration_default'
          });
        }
      }
    } catch (avatarError) {
      console.error('Error asignando avatares por defecto:', avatarError);
    }

    // ✅ REGISTRAR TRANSACCIÓN DE MONEDAS INICIALES
    await transactionService.logCurrencyTransaction(
      user.id,
      400,
      'EARN',
      'REGISTRATION_BONUS',
      'Monedas de bienvenida por registro',
      'user',
      user.id,
      { starter_deck: 40 }
    );

    // ✅ JWT CORREGIDO
    const payload = { 
      userId: user.id, 
      username: user.username 
    };
    
    const options: SignOptions = { 
      expiresIn: JWT_EXPIRES_IN as any 
    };

    const token = jwt.sign(payload, JWT_SECRET, options);

    res.status(201).json({
      message: 'Usuario registrado exitosamente. Revisa tu email para verificar tu cuenta.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        currency: user.currency,
        is_email_verified: user.is_email_verified
      },
      starter_cards: 6, // Informar que se asignaron cartas iniciales
      verification_required: true
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email y contraseña son requeridos' });
      return;
    }

    // Buscar usuario (case-insensitive)
    const user = await User.findOne({ 
      where: { 
        email: { [Op.iLike]: email } 
      } 
    });
    if (!user) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    // ✅ INVALIDAR TODAS LAS SESIONES ANTERIORES DE ESTE USUARIO
    await UserSession.update(
      { is_active: false },
      { where: { user_id: user.id, is_active: true } }
    );
    console.log(`🔐 Sesiones anteriores invalidadas para usuario ${user.username}`);

    // ✅ JWT CORREGIDO
    const payload = { 
      userId: user.id, 
      username: user.username 
    };
    
    const options: SignOptions = { 
      expiresIn: JWT_EXPIRES_IN as any  
    };

    const token = jwt.sign(payload, JWT_SECRET, options);

    // ✅ CREAR NUEVA SESIÓN ACTIVA
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 días (mismo que JWT_EXPIRES_IN)

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const session = await UserSession.create({
      user_id: user.id,
      token,
      is_active: true,
      created_at: new Date(),
      expires_at: expiresAt,
      ip_address: clientIp,
      user_agent: userAgent
    });

    console.log(`✅ Nueva sesión creada para ${user.username} (Session ID: ${session.id})`);

    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        currency: user.currency
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        currency: user.currency,
        is_email_verified: user.is_email_verified,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Token de verificación requerido' });
      return;
    }

    // Buscar usuario con el token de verificación
    const user = await User.findOne({
      where: {
        email_verification_token: token,
        email_verification_expires: {
          [Op.gt]: new Date() // Token no expirado
        }
      }
    });

    if (!user) {
      res.status(400).json({ error: 'Token de verificación inválido o expirado' });
      return;
    }

    // Verificar email
    user.is_email_verified = true;
    user.email_verification_token = null;
    user.email_verification_expires = null;
    await user.save();

    res.json({
      success: true,
      message: '¡Email verificado exitosamente! Tu cuenta está ahora activada.'
    });

  } catch (error) {
    console.error('Error verificando email:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const resendVerificationEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email es requerido' });
      return;
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    if (user.is_email_verified) {
      res.status(400).json({ error: 'Email ya está verificado' });
      return;
    }

    // Generar nuevo token
    const verificationToken = emailService.generateVerificationToken();
    const verificationExpires = emailService.generateExpirationDate();

    user.email_verification_token = verificationToken;
    user.email_verification_expires = verificationExpires;
    await user.save();

    // Enviar nuevo email
    await emailService.sendVerificationEmail(email, user.username, verificationToken);

    res.json({
      success: true,
      message: 'Email de verificación reenviado'
    });

  } catch (error) {
    console.error('Error reenviando email:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    
    if (!user || !user.userId) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    // Obtener el token del header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(400).json({ error: 'Token no encontrado' });
      return;
    }

    const token = authHeader.substring(7);

    // Marcar la sesión como inactiva
    const session = await UserSession.findOne({
      where: {
        user_id: user.userId,
        token: token,
        is_active: true
      }
    });

    if (session) {
      await session.update({ is_active: false });
      console.log(`✅ Sesión cerrada para usuario ${user.username}`);
    }

    res.json({
      success: true,
      message: 'Sesión cerrada correctamente'
    });

  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};