import { AuthenticatedWebSocket } from './websocket-auth.service';
import { WebSocketPresenceService } from './websocket-presence.service';
import { MatchesCoordinator } from '../coordinators/matchesCoordinator';

type EventHandler = (ws: AuthenticatedWebSocket, data: any) => Promise<void> | void;
export type RouterEventHandler = EventHandler;

export class WebSocketRouter {
  private handlers = new Map<string, EventHandler>();

  constructor(
    private readonly matchesCoordinator: MatchesCoordinator,
    private readonly presenceService: WebSocketPresenceService
  ) {
    this.registerCoreHandlers();
  }

  register(event: string, handler: EventHandler) {
    this.handlers.set(event, handler);
  }

  registerMany(handlers: Record<string, EventHandler>) {
    for (const [event, handler] of Object.entries(handlers)) {
      this.register(event, handler);
    }
  }

  private registerCoreHandlers() {
    this.handlers.set('match_action', async (ws, data) => {
      if (!ws.userId) {
        console.warn('⚠️ match_action sin usuario autenticado');
        return;
      }

      const result = await this.matchesCoordinator.handleAction({
        userId: ws.userId,
        action: data
      });

      if (!result?.success) {
        this.presenceService.sendToUser(ws.userId, 'error', {
          code: (result as any)?.code || 'MATCH_ACTION_ERROR',
          message: result?.error || 'No se pudo procesar la acción'
        });
        return;
      }

      if (result?.events) {
        for (const evt of result.events) {
          this.dispatchEvent(ws.userId, evt);
        }
      }
    });
  }

  private dispatchEvent(senderUserId: string, evt: any) {
    const recipients = evt?.recipients;

    if (recipients?.type === 'self') {
      this.presenceService.sendToUser(senderUserId, evt.type, evt.payload);
      return;
    }

    if (recipients?.type === 'users') {
      this.presenceService.sendToUsers(recipients.userIds || [], evt.type, evt.payload);
      return;
    }

    if (recipients?.type === 'broadcast') {
      this.presenceService.broadcast(evt.type, evt.payload);
      return;
    }

    if (evt?.scope === 'self') {
      this.presenceService.sendToUser(senderUserId, evt.type, evt.payload);
      return;
    }

    if (evt?.scope === 'users') {
      this.presenceService.sendToUsers(evt.userIds || [], evt.type, evt.payload);
      return;
    }

    if (evt?.scope === 'broadcast') {
      this.presenceService.broadcast(evt.type, evt.payload);
      return;
    }
  }

  async route(ws: AuthenticatedWebSocket, event: string, data: any) {
    const handler = this.handlers.get(event);

    if (!handler) {
      console.log(`⚠️ Evento desconocido: ${event}`);
      return;
    }

    try {
      await handler(ws, data);
    } catch (error: any) {
      console.error(`❌ Error en handler ${event}:`, error?.message || error);
      if (ws.userId) {
        this.presenceService.sendToUser(ws.userId, 'error', {
          code: 'HANDLER_ERROR',
          message: error?.message || 'Error procesando evento'
        });
      }
    }
  }
}