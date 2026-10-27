import { CardRecord } from './card-catalog.repository';

// El texto base de cards.name/description está en español.
export const BASE_LANGUAGE = 'es';
export const FALLBACK_LANGUAGE = 'en';

/** Idiomas de traducción a cargar: el pedido + EN como fallback. ES no necesita ninguno. */
export function translationLanguagesFor(lang: string): string[] {
  if (lang === BASE_LANGUAGE) return [];
  return [...new Set([lang, FALLBACK_LANGUAGE])];
}

/**
 * Aplica la traducción con la cadena de fallback: idioma pedido → EN → texto base (ES).
 * Siempre elimina `translations` del resultado.
 */
export function applyCardTranslation(card: CardRecord, lang: string): CardRecord {
  const { translations, ...result } = card;

  if (lang === BASE_LANGUAGE || !Array.isArray(translations) || translations.length === 0) {
    return result;
  }

  const translation =
    translations.find((t: any) => t.language === lang) ??
    translations.find((t: any) => t.language === FALLBACK_LANGUAGE);

  if (!translation) return result;

  result.name = translation.name || result.name;
  result.description = translation.description || result.description;

  if (result.card_abilities && translation.ability_translations) {
    result.card_abilities = result.card_abilities.map((ability: any) => {
      const abilityTranslation = translation.ability_translations[ability.id];
      if (!abilityTranslation) return ability;

      return {
        ...ability,
        name: abilityTranslation.name || ability.name,
        description: abilityTranslation.description || ability.description,
      };
    });
  }

  return result;
}
