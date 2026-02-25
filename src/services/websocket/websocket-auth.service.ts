// src/services/websocket-auth.service.ts

import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import User from '../../models/User';
import { handleAdminAuthentication } from './websocket.panel';
import { WebSocket } from 'ws';

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  username?: string;
  isAdmin?: boolean;
  isAlive?: boolean;
}

export interface AuthResult {
  userId: string;
  username: string;
  isAdmin: boolean;
}

class WebSocketAuthError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Autentica un socket entrante.
 * - Soporta usuario normal (JWT)
 * - Soporta admin vía admin_token
 * - Setea metadata mínima en ws
 */
export async function authenticateSocket(
  ws: AuthenticatedWebSocket,
  req: IncomingMessage
): Promise<AuthResult> {

  const { token, adminToken } = extractTokens(req);

  // 1️⃣ Intentar autenticación admin
  const isAdmin = await handleAdminAuthentication(ws, adminToken);
  if (isAdmin) {
    ws.isAdmin = true;

    return {
      userId: 'admin',
      username: 'admin',
      isAdmin: true
    };
  }

  // 2️⃣ Validar token usuario
  if (!token) {
    throw new WebSocketAuthError(
      'NO_TOKEN',
      'Token no proporcionado'
    );
  }

  const jwtSecret = process.env.JWT_SECRET || 'secret-key-change-in-production';

  let decoded: any;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch (err) {
    throw new WebSocketAuthError(
      'INVALID_TOKEN',
      'Token inválido'
    );
  }

  if (!decoded?.userId) {
    throw new WebSocketAuthError(
      'INVALID_TOKEN',
      'Token inválido'
    );
  }

  const user = await User.findByPk(decoded.userId);

  if (!user) {
    throw new WebSocketAuthError(
      'USER_NOT_FOUND',
      'Usuario no encontrado'
    );
  }

  // 3️⃣ Setear metadata en socket
  ws.userId = user.id;
  ws.username = user.username;
  ws.isAdmin = false;

  return {
    userId: user.id,
    username: user.username,
    isAdmin: false
  };
}

/**
 * Extrae token JWT y admin_token desde header o query
 */
function extractTokens(req: IncomingMessage): {
  token?: string;
  adminToken?: string;
} {
  let token: string | undefined;
  let adminToken: string | undefined;

  const authHeader = req.headers.authorization;

  if (authHeader) {
    token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;
  }

  if (!token && req.url) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    token = url.searchParams.get('token') || undefined;
    adminToken = url.searchParams.get('admin_token') || undefined;
  }

  return { token, adminToken };
}