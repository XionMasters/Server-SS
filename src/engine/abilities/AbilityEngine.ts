/**
 * AbilityEngine.ts
 *
 * Motor central de habilidades — interpreta AbilityDefinition sobre
 * el GameState sin conocer ninguna carta específica.
 *
 * API pública:
 *
 *   canActivate(def, state, playerNumber, sourceCardId, event)
 *     → válido/inválido — se usa desde KnightRulesEngine (tiene GameState completo)
 *
 *   canActivateFromContext(def, ctx, event)
 *     → válido/inválido — se usa desde ActionResolver (tiene modelos Sequelize, no GameState)
 *
 *   execute(def, state, playerNumber, sourceCardId, event)
 *     → { newState, affectedIds, extras }
 *
 *   getCardEntryEffects(rawAbilities)
 *     → StatusEffects a aplicar cuando una carta entra en juego (trigger CARD_PLAYED)
 *     → reemplaza el PASSIVE_EFFECT_MAP anterior
 */

import type { GameState } from '../GameState';
import type { GameEvent } from '../events/GameEvents';
import type { AbilityDefinition, CostDefinition } from './AbilityDefinition';
import { ConditionRegistry, type ConditionContext } from '../conditions/ConditionRegistry';
import { ActionRegistry, type ActionContext, type ActionResult } from '../actions/ActionRegistry';
import type { EngineContext } from '../EngineContext';

export interface AbilityCheck {
    valid: boolean;
    error?: string;
}

export interface AbilityExecution {
    newState: GameState;
    affectedIds: string[];
    extras?: Record<string, any>;
    /** Eventos emitidos durante la ejecución. Vacío si se pasó un EngineContext externo
     *  (los eventos ya están en el bus externo). */
    events: import('../events/GameEvents').GameEvent[];
}

/**
 * Contexto completo de una activación de habilidad.
 * Útil para traces de debugging y para pasar a subsistemas futuros (EventBus, logs).
 */
export interface AbilityContext {
    state: GameState;
    sourceCardId: string;
    playerNumber: 1 | 2;
    event: GameEvent;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Busca una carta en todas las zonas accesibles del jugador (campo + mano).
 * Si en el futuro añadimos más zonas activas (banco, escenario),
 * basta con agregar la búsqueda aquí.
 */
function findSourceCard(player: any, sourceCardId: string): any {
    return (
        player.field_knights.find((c: any) => c.instance_id === sourceCardId) ??
        (player.hand ?? []).find((c: any) => c.instance_id === sourceCardId) ??
        // Cartas fuera del campo con triggers reactivos (yomotsu, mazo, etc.)
        (player.passive_watchers ?? []).find((c: any) => c.instance_id === sourceCardId) ??
        null
    );
}

function buildConditionContext(
    state: GameState,
    playerNumber: 1 | 2,
    sourceCardId: string,
    event: GameEvent,
): ConditionContext {
    const player = playerNumber === 1 ? state.player1 : state.player2;
    const sourceCard = findSourceCard(player, sourceCardId);
    if (!sourceCard) {
        throw new Error(
            `[AbilityEngine] Carta fuente "${sourceCardId}" no encontrada en campo ni mano`,
        );
    }
    return {
        sourceCard: {
            instance_id: (sourceCard as any).instance_id,
            status_effects: (sourceCard as any).status_effects ?? [],
            current_cosmos: (sourceCard as any).current_cosmos ?? 0,
            current_health: (sourceCard as any).current_health,
            zone: (sourceCard as any).zone,
        },
        player: {
            hand: (player as any).hand ?? [],
            field_knights: player.field_knights,
        },
        event,
    };
}

function validateCosts(
    costs: CostDefinition[],
    ctx: ConditionContext,
    event: GameEvent,
): AbilityCheck {
    for (const cost of costs) {
        if (cost.type === 'cosmos') {
            if (ctx.sourceCard.current_cosmos < (cost.amount ?? 0)) {
                return { valid: false, error: `CP insuficiente. Requiere ${cost.amount} CP del caballero` };
            }
        }
        if (cost.type === 'discard') {
            if (!event.targetCardId) {
                return { valid: false, error: 'Debes elegir una carta de tu mano para descartar' };
            }
            const inHand = (ctx.player.hand ?? []).some((c: any) => c.instance_id === event.targetCardId);
            if (!inHand) {
                return { valid: false, error: 'La carta a descartar no está en tu mano' };
            }
        }
    }
    return { valid: true };
}

function _canActivateFromCtx(
    def: AbilityDefinition,
    ctx: ConditionContext,
    event: GameEvent,
): AbilityCheck {
    // 1. Condiciones de juego (estado de la carta, battlefield, etc.)
    for (const condition of (def.conditions ?? [])) {
        if (!ConditionRegistry.evaluate(condition, ctx)) {
            return { valid: false, error: `Condición no cumplida: ${condition.type}` };
        }
    }
    // 2. Costos (CP disponibles, carta en mano para descartar, etc.)
    return validateCosts(def.cost ?? [], ctx, event);
}

function applyCosts(
    def: AbilityDefinition,
    state: GameState,
    playerNumber: 1 | 2,
    sourceCardId: string,
    event: GameEvent,
): { costExtras: Record<string, any> } {
    const costExtras: Record<string, any> = {};
    const player = playerNumber === 1 ? state.player1 : state.player2;

    for (const cost of (def.cost ?? [])) {
        if (cost.type === 'cosmos') {
            const card = player.field_knights.find(c => c.instance_id === sourceCardId)
                      ?? (player.passive_watchers ?? []).find((c: any) => c.instance_id === sourceCardId);
            if (!card) {
                throw new Error(
                    `[AbilityEngine] Carta fuente "${sourceCardId}" no encontrada al aplicar costo de cosmo`,
                );
            }
            (card as any).current_cosmos -= (cost.amount ?? 0);
        }
        if (cost.type === 'discard' && event.targetCardId) {
            (player as any).hand = ((player as any).hand ?? []).filter(
                (c: any) => c.instance_id !== event.targetCardId,
            );
            costExtras.discard_card_id = event.targetCardId;
        }
    }
    return { costExtras };
}

function parseInternal(effects: any): AbilityDefinition | null {
    if (!effects) return null;
    try {
        const def = typeof effects === 'string' ? JSON.parse(effects) : effects;
        if (!def.trigger) return null;
        if (!Array.isArray(def.actions)) return null;
        // Cada acción debe tener un type string — rechaza arrays de primitivos o mal-formados
        if (!def.actions.every((a: any) => a && typeof a.type === 'string')) return null;
        return def as AbilityDefinition;
    } catch {
        return null;
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const AbilityEngine = {
    /** Validación con GameState completo (para KnightRulesEngine / KnightManager). */
    canActivate(
        def: AbilityDefinition,
        state: GameState,
        playerNumber: 1 | 2,
        sourceCardId: string,
        event: GameEvent,
    ): AbilityCheck {
        const ctx = buildConditionContext(state, playerNumber, sourceCardId, event);
        return _canActivateFromCtx(def, ctx, event);
    },

    /** Validación sin GameState completo (para ActionResolver con modelos Sequelize). */
    canActivateFromContext(
        def: AbilityDefinition,
        ctx: ConditionContext,
        event: GameEvent,
    ): AbilityCheck {
        return _canActivateFromCtx(def, ctx, event);
    },

    /** Ejecuta la habilidad y retorna nuevo estado.
     *
     * @param def          Definición declarativa de la habilidad.
     * @param state        Estado actual (se clona si no se pasa engineCtx).
     * @param playerNumber Jugador que activa.
     * @param sourceCardId Carta que activa.
     * @param event        Evento que disparó o contexto de activación.
     * @param engineCtx    Contexto externo opcional (de PassiveTriggerEngine o acción encadenada).
     *                     Si se proporciona: se usa su estado directamente (sin clonar) y los
     *                     eventos van al bus externo. Si no: se crea contexto interno propio.
     */
    execute(
        def: AbilityDefinition,
        state: GameState,
        playerNumber: 1 | 2,
        sourceCardId: string,
        event: GameEvent,
        engineCtx?: EngineContext,
    ): AbilityExecution {
        // Si hay contexto externo, operamos sobre el estado compartido (ya es un clon).
        // Si no, creamos uno nuevo para esta ejecución.
        let ctx: EngineContext;
        let isExternal: boolean;

        if (engineCtx) {
            ctx = engineCtx;
            isExternal = true;
        } else {
            // Importación diferida igual que en EngineContext para evitar ciclo
            const { createEngineContext } = require('../EngineContext') as typeof import('../EngineContext');
            ctx = createEngineContext(state);
            isExternal = false;
        }

        const { costExtras } = applyCosts(def, ctx.state, playerNumber, sourceCardId, event);

        const result: ActionResult = {
            state: ctx.state,
            affectedIds: [sourceCardId],
            extras: { ...costExtras },
        };
        const actionCtx: ActionContext = {
            playerNumber,
            sourceCardId,
            event,
            rng: Math.random,
            bus: ctx.bus,
        };
        ActionRegistry.executeAll(def.actions, actionCtx, result);

        ctx.state.updated_at = Date.now();
        return {
            newState: ctx.state,
            affectedIds: [...new Set(result.affectedIds)],
            extras: result.extras,
            // Si el ctx es externo, los eventos ya están en el bus externo.
            // Retornamos array vacío para que el caller no los duplique.
            events: isExternal ? [] : [...ctx.bus.events],
        };
    },

    /**
     * Retorna los StatusEffects a aplicar cuando una carta entra en juego.
     * Lee habilidades con trigger CARD_PLAYED y acciones apply_status.
     * Reemplaza el antiguo PASSIVE_EFFECT_MAP en cardManager.
     *
     * @param rawAbilities Array de { type: string, effects: any } de card_abilities
     */
    getCardEntryEffects(
        rawAbilities: Array<{ type: string; effects: any }>,
    ): Array<{ type: string; remaining_turns: number | null; value?: number }> {
        const effects: Array<{ type: string; remaining_turns: number | null; value?: number }> = [];

        for (const raw of rawAbilities) {
            if (raw.type !== 'pasiva') continue;
            const def = parseInternal(raw.effects);
            if (!def || def.trigger !== 'CARD_PLAYED') continue;

            for (const action of def.actions) {
                if (action.type === 'apply_status' && (!action.target || action.target === 'self')) {
                    // type === 'apply_status' narrows to ApplyStatusAction
                    const a = action as import('./AbilityDefinition').ApplyStatusAction;
                    effects.push({
                        type: a.status,
                        // null = permanente (sin expiración)
                        // 0    = expira al inicio del siguiente turno propio
                        // N    = dura N turnos
                        remaining_turns: a.duration ?? null,
                        ...(a.value !== undefined ? { value: a.value } : {}),
                    });
                }
            }
        }
        return effects;
    },
};
