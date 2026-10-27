jest.mock('../../src/infrastructure/database/models/UserTransaction', () => ({
  __esModule: true,
  default: { create: jest.fn() },
}));

jest.mock('../../src/infrastructure/database/models/UserCardTransaction', () => ({
  __esModule: true,
  default: { create: jest.fn() },
}));

jest.mock('../../src/infrastructure/database/models/User', () => ({
  __esModule: true,
  default: { findByPk: jest.fn() },
}));

import User from '../../src/infrastructure/database/models/User';
import UserTransaction from '../../src/infrastructure/database/models/UserTransaction';
import transactionService from '../../src/infrastructure/database/services/transaction.service';

describe('transactionService', () => {
  it('writes the currency ledger with the locked transaction and supplied balance', async () => {
    const transaction = {} as any;
    (UserTransaction.create as jest.Mock).mockResolvedValue({ id: 'ledger-id' });

    await transactionService.logCurrencyTransaction(
      'user-id',
      100,
      'SPEND',
      'PACK_PURCHASE',
      'Compra de 1x Pack',
      'pack',
      'pack-id',
      { quantity: 1 },
      transaction,
      { before: 400, after: 300 }
    );

    expect(User.findByPk).not.toHaveBeenCalled();
    expect(UserTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-id',
        balance_before: 400,
        balance_after: 300,
      }),
      { transaction }
    );
  });
});
