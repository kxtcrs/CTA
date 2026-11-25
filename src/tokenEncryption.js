const crypto = require('node:crypto');

function getEncryptionKey() {
  const key = Buffer.from(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return key;
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64')
  ].join('.');
}

function decryptToken(value) {
  const [encodedIv, encodedTag, encodedData] = value.split('.');
  if (!encodedIv || !encodedTag || !encodedData) {
    throw new Error('Stored Google authorization data is invalid.');
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(),
      Buffer.from(encodedIv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedData, 'base64')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    throw new Error('Could not decrypt Google authorization. Check that GOOGLE_TOKEN_ENCRYPTION_KEY has not changed.');
  }
}

module.exports = { decryptToken, encryptToken, getEncryptionKey };
