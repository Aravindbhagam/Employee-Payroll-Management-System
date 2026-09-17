const { sendPasswordResetEmail } = require('../../src/utils/email');

describe('sendPasswordResetEmail', () => {
  const originalApiKey = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
  });

  it('does not call fetch when RESEND_API_KEY is not configured (dev/test fallback)', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await sendPasswordResetEmail('someone@test.local', 'a-token');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls the Resend API with the reset link when RESEND_API_KEY is configured', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);

    await sendPasswordResetEmail('someone@test.local', 'a-token');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.headers.Authorization).toBe('Bearer re_test_key');
    const body = JSON.parse(options.body);
    expect(body.to).toBe('someone@test.local');
    expect(body.text).toContain('a-token');
  });

  it('throws when the Resend API responds with a non-2xx status', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'Invalid recipient' })
    );

    await expect(sendPasswordResetEmail('bad@test.local', 'a-token')).rejects.toThrow(/422/);
  });
});
