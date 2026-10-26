import { CardInGameState, Player } from '../GameState';
import {
  StatusEffect,
  StatusEffectType,
  addOrRefreshEffect,
} from '../StatusEffects';

export interface TechniqueSemanticContext {
  effect: StatusEffect;
  knight: CardInGameState;
  defenderCard: CardInGameState | null;
  defenderPlayer: Player;
  playerNumber: 1 | 2;
  applyStatusToDefender: (statusType: StatusEffectType) => void;
}

/**
 * Sub-acción dentro de un efecto ta_combo.
 *
 * Equivale a las primitivas individuales pero en array:
 *
 * @example
 * {
 *   type: "ta_combo",
 *   remaining_turns: null,
 *   params: {
 *     actions: [
 *       { action: "extra_damage",    value: 3 },
 *       { action: "modify_target_ar", value: -2 },
 *       { action: "apply_status",    status_types: ["paralyzed"] }
 *     ]
 *   }
 * }
 */
export interface TaComboAction {
  /** Tipo de sub-acción. */
  action:
    | 'apply_status'
    | 'modify_target_ce'
    | 'modify_target_ar'
    | 'extra_damage'
    | 'modify_defender_cosmos'
    | 'drain_target_cosmos'
    | 'destroy_assistant'
    | 'grant_immune_negative';
  /** Valor numérico (positivo o negativo). Para modify_* y extra_damage. */
  value?: number;
  /** Uno o más StatusEffectType a aplicar. Para apply_status. */
  status_types?: string[];
  /** Alias de status_types cuando es uno solo. */
  status_type?: string;
}

type TechniqueSemanticHandler = (ctx: TechniqueSemanticContext) => void;

function getNumericValue(effect: StatusEffect, fallback: number): number {
  return typeof effect.value === 'number' && Number.isFinite(effect.value)
    ? effect.value
    : fallback;
}

function getStatusTypesFromParams(effect: StatusEffect): StatusEffectType[] {
  const params = effect.params as { status_type?: unknown; status_types?: unknown } | undefined;
  const single = typeof params?.status_type === 'string' ? [params.status_type] : [];
  const multi = Array.isArray(params?.status_types)
    ? params!.status_types.filter((s): s is string => typeof s === 'string')
    : [];

  const raw = [...single, ...multi];
  return raw.filter((s): s is StatusEffectType => s in TA_APPLICABLE_STATUS);
}

function applyDeltaToTargetStat(
  target: CardInGameState,
  stat: 'ce' | 'ar',
  baseStat: 'base_ce' | 'base_ar',
  delta: number,
): void {
  target[stat] = Math.max(0, (target[stat] ?? 0) + delta);
  target[baseStat] = Math.max(0, (target[baseStat] ?? 0) + delta);
}

const TA_APPLICABLE_STATUS: Partial<Record<StatusEffectType, true>> = {
  paralyzed: true,
  poison: true,
  frozen: true,
  burn: true,
};

/**
 * Ejecuta una sub-acción TaComboAction en el contexto dado.
 * Reutilizado por individual handlers y por ta_combo.
 */
function executeTaAction(sub: TaComboAction, ctx: TechniqueSemanticContext): void {
  const value = typeof sub.value === 'number' && Number.isFinite(sub.value) ? sub.value : 0;

  switch (sub.action) {
    case 'apply_status': {
      if (!ctx.defenderCard) return;
      const singles = typeof sub.status_type === 'string' ? [sub.status_type] : [];
      const multi   = Array.isArray(sub.status_types) ? sub.status_types : [];
      const types   = [...singles, ...multi];
      for (const s of types) {
        if (s in TA_APPLICABLE_STATUS) {
          ctx.applyStatusToDefender(s as StatusEffectType);
        }
      }
      break;
    }
    case 'modify_target_ce':
      if (ctx.defenderCard) applyDeltaToTargetStat(ctx.defenderCard, 'ce', 'base_ce', value);
      break;
    case 'modify_target_ar':
      if (ctx.defenderCard) applyDeltaToTargetStat(ctx.defenderCard, 'ar', 'base_ar', value);
      break;
    case 'extra_damage':
      ctx.defenderPlayer.life = Math.max(0, (ctx.defenderPlayer.life ?? 0) - Math.max(0, value));
      break;
    case 'modify_defender_cosmos':
      ctx.defenderPlayer.cosmos = Math.max(0, (ctx.defenderPlayer.cosmos ?? 0) + value);
      break;
    case 'drain_target_cosmos':
      if (ctx.defenderCard) ctx.defenderCard.current_cosmos = 0;
      break;
    case 'destroy_assistant':
      ctx.defenderPlayer.field_helper = null;
      break;
    case 'grant_immune_negative':
      ctx.knight.status_effects = addOrRefreshEffect(ctx.knight.status_effects ?? [], {
        type: 'immune_negative',
        remaining_turns: 1,
        source: { card_instance_id: ctx.knight.instance_id, player: ctx.playerNumber, type: 'passive' },
      });
      break;
  }
}

const HANDLERS: Partial<Record<StatusEffectType, TechniqueSemanticHandler>> = {
  // Nuevo modo configurable: aplica estado(s) via params.status_type/status_types.
  ta_apply_status: (ctx) => {
    if (!ctx.defenderCard) return;
    for (const statusType of getStatusTypesFromParams(ctx.effect)) {
      ctx.applyStatusToDefender(statusType);
    }
  },
  // Nuevo modo configurable: modifica CE/base_ce del objetivo con value.
  ta_modify_target_ce: (ctx) => {
    if (!ctx.defenderCard) return;
    applyDeltaToTargetStat(ctx.defenderCard, 'ce', 'base_ce', getNumericValue(ctx.effect, 0));
  },
  // Nuevo modo configurable: modifica AR/base_ar del objetivo con value.
  ta_modify_target_ar: (ctx) => {
    if (!ctx.defenderCard) return;
    applyDeltaToTargetStat(ctx.defenderCard, 'ar', 'base_ar', getNumericValue(ctx.effect, 0));
  },
  // Nuevo modo configurable: daño extra al jugador defensor con value.
  ta_extra_damage: (ctx) => {
    const extra = Math.max(0, getNumericValue(ctx.effect, 0));
    ctx.defenderPlayer.life = Math.max(0, (ctx.defenderPlayer.life ?? 0) - extra);
  },
  // Nuevo modo configurable: modifica cosmos del jugador defensor con value.
  ta_modify_defender_cosmos: (ctx) => {
    ctx.defenderPlayer.cosmos = Math.max(0, (ctx.defenderPlayer.cosmos ?? 0) + getNumericValue(ctx.effect, 0));
  },
  // Combo: ejecuta múltiples sub-acciones en orden desde params.actions[].
  ta_combo: (ctx) => {
    const actions = (ctx.effect.params?.actions ?? []) as TaComboAction[];
    for (const sub of actions) {
      if (sub && typeof sub.action === 'string') {
        executeTaAction(sub, ctx);
      }
    }
  },

  // Compatibilidad legacy: delegan a executeTaAction con parámetros fijos.
  ta_causes_par_psn: (ctx) => {
    executeTaAction({ action: 'apply_status', status_types: ['paralyzed', 'poison'] }, ctx);
  },
  ta_drains_target_cosmos: (ctx) => {
    executeTaAction({ action: 'drain_target_cosmos' }, ctx);
  },
  ta_reduce_ar_2: (ctx) => {
    executeTaAction({ action: 'modify_target_ar', value: -getNumericValue(ctx.effect, 2) }, ctx);
  },
  ta_extra_damage_3: (ctx) => {
    executeTaAction({ action: 'extra_damage', value: getNumericValue(ctx.effect, 3) }, ctx);
  },
  ta_destroy_assistant: (ctx) => {
    executeTaAction({ action: 'destroy_assistant' }, ctx);
  },
  ta_drain_cosmos_2: (ctx) => {
    executeTaAction({ action: 'modify_defender_cosmos', value: -getNumericValue(ctx.effect, 2) }, ctx);
  },
  ta_immune_negative: (ctx) => {
    executeTaAction({ action: 'grant_immune_negative' }, ctx);
  },
  // ── Pendiente: requieren infraestructura de broadcast al cliente ──────────
  // ta_summon_crow_token: se activa cuando se implementen tokens en el modelo.
  // ta_reveal_hand: se activa cuando se implemente la visibilidad de mano.
};

export function applyTechniqueSemanticEffect(ctx: TechniqueSemanticContext): void {
  const handler = HANDLERS[ctx.effect.type];
  if (handler) handler(ctx);
}
