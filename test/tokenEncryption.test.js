const test = require('node:test');
const assert = require('node:assert/strict');
const { decryptToken, encryptToken } = require('../src/tokenEncryption');

test('encrypts Google tokens at rest and decrypts them with the configured key', () => {
  const previousKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

  try {
    const token = 'google-refresh-token';
    const encrypted = encryptToken(token);
    assert.notEqual(encrypted, token);
    assert.equal(decryptToken(encrypted), token);
  } finally {
    if (previousKey === undefined) {
      delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previousKey;
    }
  }
});

test('rejects an encryption key that is not 32 bytes', () => {
  const previousKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(16, 7).toString('base64');

  try {
    assert.throws(() => encryptToken('google-refresh-token'), /32-byte key/);
  } finally {
    if (previousKey === undefined) {
      delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previousKey;
    }
  }
});
