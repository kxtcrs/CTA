const { google } = require('googleapis');
const { getGoogleOAuthClientForGuild } = require('./googleAuth');
const { SHEET_HEADERS } = require('./validation');

function createSheetsClient(auth) {
  return google.sheets({ version: 'v4', auth });
}

async function prepareSheet(auth, spreadsheetId, sheetTab) {
  const sheets = createSheetsClient(auth);
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title'
  });
  const exists = spreadsheet.data.sheets.some((sheet) => sheet.properties.title === sheetTab);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetTab } } }]
      }
    });
  }

  const headerRange = `${quoteSheetTab(sheetTab)}!A1:F1`;
  const header = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange
  });
  const existingHeaders = header.data.values && header.data.values[0];
  if (existingHeaders && existingHeaders.length > 0) {
    const matches = SHEET_HEADERS.every((value, index) => existingHeaders[index] === value);
    if (!matches) {
      throw new Error(`The first row in "${sheetTab}" is already in use. Choose an empty tab for signups.`);
    }
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: headerRange,
      valueInputOption: 'RAW',
      requestBody: { values: [SHEET_HEADERS] }
    });
  }
  return sheets;
}

async function appendSignup(settings, row) {
  const auth = await getGoogleOAuthClientForGuild(settings.guild_id);
  const sheets = createSheetsClient(auth);
  await sheets.spreadsheets.values.append({
    spreadsheetId: settings.spreadsheet_id,
    range: `${quoteSheetTab(settings.sheet_tab)}!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

function quoteSheetTab(name) {
  return `'${name.replace(/'/g, "''")}'`;
}

module.exports = { appendSignup, prepareSheet };
