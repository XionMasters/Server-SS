import { validateCardBody } from '../../src/app/admin/card-admin.validation';
import { CardAdminError, CardAdminUseCases } from '../../src/app/admin/card-admin';

const validCard = {
  code: 'SS-001',
  name: 'Seiya',
  type: 'knight',
  rarity: 'rare',
  cost: 3,
};

const errorsOf = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CardAdminError);
    expect((error as CardAdminError).status).toBe(400);
    return ((error as CardAdminError).details?.errores as string[]) ?? [];
  }
  throw new Error('Se esperaba un error de validación');
};

describe('validateCardBody', () => {
  test('accepts a valid card and drops unknown fields', () => {
    const result = validateCardBody({ ...validCard, id: 'x', created_at: 'hoy', hack: true }, 'create');
    expect(result).toEqual(validCard);
  });

  test('requires the mandatory fields on create but not on update', () => {
    expect(errorsOf(() => validateCardBody({}, 'create'))).toEqual(
      expect.arrayContaining(['code es obligatorio', 'name es obligatorio', 'type es obligatorio', 'rarity es obligatorio'])
    );
    expect(validateCardBody({ cost: 4 }, 'update')).toEqual({ cost: 4 });
  });

  test('accepts the Spanish translation as the name', () => {
    const { name, ...rest } = validCard;
    expect(() => validateCardBody({ ...rest, translations: { es: { name } } }, 'create')).not.toThrow();
  });

  test('rejects wrong types, enums and lengths', () => {
    const errors = errorsOf(() => validateCardBody({
      ...validCard,
      type: 'dragon',
      cost: -1,
      unique: 'si',
      tags: [1],
      name: 'x'.repeat(101),
      element: 'plasma',
    }, 'create'));

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('type'),
      expect.stringContaining('cost'),
      expect.stringContaining('unique'),
      expect.stringContaining('tags'),
      expect.stringContaining('name'),
      expect.stringContaining('element'),
    ]));
  });

  test('allows null only on nullable fields', () => {
    expect(validateCardBody({ element: null, description: null }, 'update')).toEqual({ element: null, description: null });
    expect(errorsOf(() => validateCardBody({ code: null }, 'update'))).toEqual(['code no puede ser null']);
  });

  test('validates stats and abilities shapes and strips stats ids', () => {
    expect(validateCardBody({ stats: { id: 1, card_id: 'c', attack: 3 }, abilities: [] }, 'update'))
      .toEqual({ stats: { attack: 3 }, abilities: [] });
    expect(errorsOf(() => validateCardBody({ stats: [1], abilities: ['x'] }, 'update'))).toHaveLength(2);
  });

  test('rejects non-object bodies', () => {
    expect(() => validateCardBody(null, 'create')).toThrow(CardAdminError);
    expect(() => validateCardBody([validCard], 'create')).toThrow(CardAdminError);
  });

  test('use cases do not reach the repository with an invalid body', async () => {
    const repository = { saveCard: jest.fn() } as any;
    const useCases = new CardAdminUseCases(repository);

    await expect(useCases.createCard({ code: 'x' })).rejects.toBeInstanceOf(CardAdminError);
    await expect(useCases.updateCard('id', { rarity: 'mythic' })).rejects.toBeInstanceOf(CardAdminError);
    expect(repository.saveCard).not.toHaveBeenCalled();
  });
});
