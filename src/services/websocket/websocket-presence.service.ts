// src/services/websocket-presence.service.ts

import { WebSocket } from 'ws';

export interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  username?: string;
  isAdmin?: boolean;
}

export interface OnlineUser {
  userId: string;
  username: string;
  avatarUrl?: string;
  connectedAt: Date;
  status: 'online' | 'in_match' | 'away';
}

function sendEvent(ws: WebSocket, event: string, data: any = {}) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}

export class WebSocketPresenceService {

  // userId -> Set de sockets activos
  private userSocketSets = new Map<string, Set<AuthenticatedWebSocket>>();

  // socket -> userId (para cleanup rápido)
  private socketUsers = new Map<AuthenticatedWebSocket, string>();

  // Metadata de usuarios online
  private onlineUsers = new Map<string, OnlineUser>();

  // ===============================
  // REGISTRO DE CONEXIONES
  // ===============================

  registerConnection(
    ws: AuthenticatedWebSocket,
    userId: string,
    username: string,
    avatarUrl?: string
  ) {

    const set = this.userSocketSets.get(userId) || new Set<AuthenticatedWebSocket>();
    set.add(ws);
    this.userSocketSets.set(userId, set);

    this.socketUsers.set(ws, userId);

    if (!this.onlineUsers.has(userId)) {
      this.onlineUsers.set(userId, {
        userId,
        username,
        avatarUrl,
        connectedAt: new Date(),
        status: 'online'
      });
    }

    console.log(`🔌 Conexión registrada para ${username}. Total sockets: ${set.size}`);
  }

  removeConnection(ws: AuthenticatedWebSocket) {

    const userId = this.socketUsers.get(ws);
    if (!userId) return;

    const set = this.userSocketSets.get(userId);

    if (set) {
      set.delete(ws);

      if (set.size === 0) {
        this.userSocketSets.delete(userId);
        this.onlineUsers.delete(userId);
      }
    }

    this.socketUsers.delete(ws);

    console.log(`❌ Conexión removida para ${userId}`);
  }

  // ===============================
  // ENVÍO DE EVENTOS
  // ===============================

  sendToSocket(ws: WebSocket, event: string, payload: any) {
    sendEvent(ws, event, payload);
  }

  sendToUser(userId: string, event: string, payload: any) {
    const set = this.userSocketSets.get(userId);
    if (!set) return;

    for (const ws of set) {
      sendEvent(ws, event, payload);
    }
  }

  broadcast(event: string, payload: any) {
    for (const set of this.userSocketSets.values()) {
      for (const ws of set) {
        sendEvent(ws, event, payload);
      }
    }
  }

  sendToUsers(userIds: string[], event: string, payload: any) {
    for (const userId of userIds) {
      this.sendToUser(userId, event, payload);
    }
  }

  broadcastToUsers(userIds: string[], event: string, payload: any) {
    this.sendToUsers(userIds, event, payload);
  }

  getPrimarySocketsMap(): Map<string, AuthenticatedWebSocket> {
    const map = new Map<string, AuthenticatedWebSocket>();

    for (const [userId, set] of this.userSocketSets.entries()) {
      const socket = Array.from(set).find(s => s.readyState === WebSocket.OPEN) || Array.from(set)[0];
      if (socket) {
        map.set(userId, socket);
      }
    }

    return map;
  }

  getSocketSetsMap(): Map<string, Set<AuthenticatedWebSocket>> {
    return this.userSocketSets;
  }

  // ===============================
  // ONLINE USERS
  // ===============================

  getOnlineUsers(): OnlineUser[] {
    return Array.from(this.onlineUsers.values());
  }

  updateUserStatus(userId: string, status: OnlineUser['status']) {
    const user = this.onlineUsers.get(userId);
    if (!user) return;

    user.status = status;
  }

  isUserOnline(userId: string): boolean {
    return this.userSocketSets.has(userId);
  }

  getUserSocketCount(userId: string): number {
    return this.userSocketSets.get(userId)?.size || 0;
  }
}