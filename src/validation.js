const SHEET_HEADERS = [
  'Signed Up At (UTC)',
  'Discord User ID',
  'Discord Name',
  'Albion In-Game Name',
  'Preferred Role',
  'Weapons (at least 3)'
];

function extractSpreadsheetId(input) {
  const value = input.trim();
  const match = value.match(/(?:\/spreadsheets\/d\/)([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(value)) return value;
  throw new Error('Enter a Google Sheets URL or spreadsheet ID.');
}

function parseWeapons(input) {
  const weapons = input
    .split(/[,\n;]/)
    .map((weapon) => weapon.trim())
    .filter(Boolean);
  if (weapons.length < 3) {
    throw new Error('Please list at least 3 weapons, separated by commas or new lines.');
  }
  return weapons;
}

function cleanText(input, fieldName, maxLength) {
  const value = input.trim();
  if (!value) throw new Error(`${fieldName} cannot be empty.`);
  if (value.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return value;
}

function cleanSheetTab(input) {
  const value = cleanText(input, 'Tab name', 100);
  if (/[\[\]:*?\/\\]/.test(value)) {
    throw new Error('Tab name cannot contain these characters: [ ] : * ? / \\');
  }
  return value;
}

module.exports = { SHEET_HEADERS, cleanSheetTab, cleanText, extractSpreadsheetId, parseWeapons };
