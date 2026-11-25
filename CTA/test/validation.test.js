const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanSheetTab, cleanText, extractSpreadsheetId, parseWeapons } = require('../src/validation');

test('extracts a spreadsheet ID from a Sheets URL or accepts a raw ID', () => {
  assert.equal(extractSpreadsheetId('https://docs.google.com/spreadsheets/d/abc_123-DEF/edit#gid=0'), 'abc_123-DEF');
  assert.equal(extractSpreadsheetId('abcdefghijklmnopqrstuv'), 'abcdefghijklmnopqrstuv');
});

test('rejects invalid spreadsheet IDs and fewer than three weapons', () => {
  assert.throws(() => extractSpreadsheetId('not a sheet'), /Google Sheets URL/);
  assert.throws(() => parseWeapons('Holy Staff, Nature Staff'), /at least 3 weapons/);
});

test('parses and trims weapon names separated by commas and new lines', () => {
  assert.deepEqual(parseWeapons(' Great Holy, Hallowfall\nFallen Staff '), [
    'Great Holy',
    'Hallowfall',
    'Fallen Staff'
  ]);
});

test('validates required signup text and maximum length', () => {
  assert.throws(() => cleanText('  ', 'Role', 80), /cannot be empty/);
  assert.throws(() => cleanText('long', 'Role', 3), /3 characters or fewer/);
});

test('rejects invalid Google Sheets tab names', () => {
  assert.equal(cleanSheetTab(' Signups '), 'Signups');
  assert.throws(() => cleanSheetTab('Bad/Tab'), /cannot contain/);
});
