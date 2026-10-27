import matchesRoutes from '../../src/interfaces/http/routes/matches.routes';

describe('Legacy HTTP matchmaking routes', () => {
  test.each(['/find', '/cancel-search'])('%s responds with 410 and directs clients to WebSocket', (path) => {
    const router = matchesRoutes as any;
    const routeLayer = router.stack.find((layer: any) => layer.route?.path === path);
    expect(routeLayer).toBeDefined();

    const response = {
      headers: {} as Record<string, string>,
      statusCode: 200,
      body: undefined as unknown,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };

    routeLayer.route.stack[0].handle({}, response);

    expect(response.statusCode).toBe(410);
    expect(response.headers.Deprecation).toBe('true');
    expect(response.body).toEqual({
      error: expect.stringContaining('search_match y cancel_search'),
    });
  });
});
