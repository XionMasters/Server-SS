import userCardsRoutes from '../../src/interfaces/http/routes/userCards.routes';

describe('userCardsRoutes', () => {
  it('does not expose collection mutation endpoints', () => {
    const methods = (userCardsRoutes as any).stack
      .map((layer: any) => layer.route?.methods)
      .filter(Boolean)
      .flatMap((routeMethods: Record<string, boolean>) => Object.keys(routeMethods));

    expect(methods).toEqual(['get', 'get']);
  });
});
