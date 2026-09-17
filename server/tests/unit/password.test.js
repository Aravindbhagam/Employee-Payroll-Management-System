const { comparePassword, hashPassword, isPasswordStrong, maskSensitive } = require('../../src/utils/password');

describe('password utils', () => {
  it('hashes a password and verifies it round-trips correctly', async () => {
    const hash = await hashPassword('Password123!');
    expect(hash).not.toBe('Password123!');
    expect(await comparePassword('Password123!', hash)).toBe(true);
    expect(await comparePassword('WrongPassword1', hash)).toBe(false);
  });

  it('produces a different hash each time (salted)', async () => {
    const a = await hashPassword('Password123!');
    const b = await hashPassword('Password123!');
    expect(a).not.toBe(b);
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(isPasswordStrong('Ab1').ok).toBe(false);
  });

  it('rejects passwords missing an uppercase letter', () => {
    expect(isPasswordStrong('password123').ok).toBe(false);
  });

  it('rejects passwords missing a lowercase letter', () => {
    expect(isPasswordStrong('PASSWORD123').ok).toBe(false);
  });

  it('rejects passwords missing a number', () => {
    expect(isPasswordStrong('PasswordOnly').ok).toBe(false);
  });

  it('accepts a password meeting all requirements', () => {
    expect(isPasswordStrong('Password123').ok).toBe(true);
  });

  it('masks all but the last 4 characters of a sensitive value', () => {
    expect(maskSensitive('000123456789')).toBe('********6789');
  });

  it('passes through null/undefined unchanged', () => {
    expect(maskSensitive(null)).toBeNull();
    expect(maskSensitive(undefined)).toBeNull();
  });
});
