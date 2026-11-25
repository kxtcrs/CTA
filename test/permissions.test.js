const test = require('node:test');
const assert = require('node:assert/strict');
const { canConfigureSheet } = require('../src/permissions');

function interaction({ userId = 'member', ownerId = 'owner', roleNames = [] } = {}) {
  return {
    guild: { ownerId },
    user: { id: userId },
    member: {
      roles: {
        cache: roleNames.map((name) => ({ name }))
      }
    }
  };
}

test('allows the server owner to configure the sheet', () => {
  assert.equal(canConfigureSheet(interaction({ userId: 'owner' })), true);
});

test('allows a member with the Officer role regardless of capitalization', () => {
  assert.equal(canConfigureSheet(interaction({ roleNames: ['Member', 'OFFICER'] })), true);
});

test('supports raw Discord interaction role IDs', () => {
  const member = interaction();
  member.member.roles = ['officer-role-id'];
  member.guild.roles = {
    cache: new Map([['officer-role-id', { name: 'Officer' }]])
  };
  assert.equal(canConfigureSheet(member), true);
});

test('denies other members and interactions outside a server', () => {
  assert.equal(canConfigureSheet(interaction({ roleNames: ['Administrator'] })), false);
  assert.equal(canConfigureSheet({ user: { id: 'owner' }, member: { roles: { cache: [] } } }), false);
});
