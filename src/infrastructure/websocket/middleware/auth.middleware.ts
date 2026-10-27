// src/infrastructure/websocket/middleware/auth.middleware.ts

import { IncomingMessage } from 'http';
import User from '../../database/models/User';
import { handleAdminAuthentication } from '../../../interfaces/websocket/handlers/admin.handler';
import { WebSocket } from 'ws';
import { getActiveUserSession } from '../../auth/session.service';
import { verifyUserAccessToken } from '../../auth/token.service';

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  username?: string;
  isAdmin?: boolean;
  isAlive?: boolean;
  isEmailVerified?: boolean;
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
 * - Soporta admin mediante el esquema Authorization: AdminBearer
 * - Setea metadata mínima en ws
 */
export async function authenticateSocket(
  ws: AuthenticatedWebSocket,
  req: IncomingMessage
): Promise<AuthResult> {

  const { token, adminToken } = extractTokens(req);

  // 1️⃣ Intentar autenticación admin
  if (adminToken) {
    const isAdmin = await handleAdminAuthentication(ws, adminToken);
    if (!isAdmin) {
      throw new WebSocketAuthError(
        'INVALID_ADMIN_TOKEN',
        'Token de admin inválido'
      );
    }

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

  let decoded;
  try {
    decoded = verifyUserAccessToken(token);
  } catch (err) {
    throw new WebSocketAuthError(
      'INVALID_TOKEN',
      'Token inválido'
    );
  }

  const session = await getActiveUserSession(decoded.userId, decoded.sessionId, token);
  if (!session) {
    throw new WebSocketAuthError(
      'SESSION_INVALIDATED',
      'Sesión inválida o cerrada'
    );
  }

  const user = await User.findByPk(decoded.userId);

  if (!user) {
    throw new WebSocketAuthError(
      'USER_NOT_FOUND',
      'Usuario no encontrado'
    );
  }

  if (user.blocked_at) {
    throw new WebSocketAuthError(
      'USER_BLOCKED',
      'Tu cuenta ha sido bloqueada'
    );
  }

  // 3️⃣ Setear metadata en socket
  ws.userId = user.id;
  ws.username = user.username;
  ws.isAdmin = false;
  ws.isEmailVerified = !!user.is_email_verified;

  return {
    userId: user.id,
    username: user.username,
    isAdmin: false
  };
}

/**
 * Extrae el token de usuario o admin desde Authorization.
 * Los navegadores no pueden enviar headers en un WebSocket, así que el panel
 * admin envía su token como subprotocolo: `Sec-WebSocket-Protocol: admin, <jwt>`.
 */
function extractTokens(req: IncomingMessage): {
  token?: string;
  adminToken?: string;
} {
  let token: string | undefined;
  let adminToken: string | undefined;

  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (authHeader?.startsWith('AdminBearer ')) {
    adminToken = authHeader.slice('AdminBearer '.length);
  } else {
    adminToken = extractAdminSubprotocolToken(req.headers['sec-websocket-protocol']);
  }

  return { token, adminToken };
}

export const ADMIN_SUBPROTOCOL = 'admin';

function extractAdminSubprotocolToken(header: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (!raw) return undefined;

  const protocols = raw.split(',').map((protocol) => protocol.trim()).filter(Boolean);
  if (protocols[0] !== ADMIN_SUBPROTOCOL || !protocols[1]) return undefined;

  return protocols[1];
}