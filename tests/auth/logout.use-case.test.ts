jest.mock('../../src/infrastructure/auth/session.service', () => ({
  deactivateUserSession: jest.fn(),
}));

import { LogoutUseCase } from '../../src/app/auth/logout.use-case';
import { deactivateUserSession } from '../../src/infrastructure/auth/session.service';

describe('LogoutUseCase', () => {
  it('deactivates only the authenticated session', async () => {
    const useCase = new LogoutUseCase();

    await useCase.execute('user-id', 'session-id');

    expect(deactivateUserSession).toHaveBeenCalledWith('user-id', 'session-id');
  });
});
