const SHEET_NAME = 'Poems';

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'list';
  if (action !== 'list') {
    return jsonOut({ error: 'Unsupported action' });
  }

  const limit = Math.max(1, Math.min(50, Number((e.parameter && e.parameter.limit) || 20)));
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) return jsonOut({ entries: [] });

  const headers = values[0];
  const rows = values.slice(1).map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));

  rows.sort((a, b) => {
    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });

  return jsonOut({ entries: rows.slice(0, limit) });
}

function doPost(e) {
  const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  if (body.action !== 'submit' || !body.entry) {
    return jsonOut({ error: 'Unsupported action' });
  }

  const entry = body.entry;
  const name = String(entry.name || 'anonymous observer').trim().slice(0, 24);
  const title = String(entry.title || 'UNTITLED POEM').trim().slice(0, 80);
  const text = String(entry.text || '').trim().slice(0, 900);
  const score = Number(entry.score || 0);
  const seed = Number(entry.seed || 0);
  const createdAt = String(entry.createdAt || new Date().toISOString());

  if (!text) return jsonOut({ error: 'Missing poem text' });

  const sheet = getSheet_();
  sheet.appendRow([name, title, text, score, seed, createdAt]);

  return jsonOut({ ok: true });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['name', 'title', 'text', 'score', 'seed', 'createdAt']);
  }
  return sheet;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
