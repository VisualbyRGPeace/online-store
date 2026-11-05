/**
 * Mã Google Apps Script dán vào Google Sheet của người dùng.
 * Biến Google Sheet thành "máy chủ" nhỏ: website đọc/ghi công việc qua địa chỉ web app của script này.
 * (Viết bằng String.raw và không dùng dấu ` hay ${ bên trong để chép nguyên văn.)
 */
export const JOB_APPS_SCRIPT = String.raw`// ===== Quản lý Job - dán TOÀN BỘ đoạn này vào Apps Script của Google Sheet =====
// BƯỚC QUAN TRỌNG: đổi TOKEN bên dưới thành mật mã riêng của bạn (ít nhất 8 ký tự).
var TOKEN = 'doi-ma-nay-thanh-mat-ma-rieng-cua-ban';

var PLACEHOLDER = 'doi-ma-nay-thanh-mat-ma-rieng-cua-ban';
var SHEET_NAME = 'Jobs';
var HEADERS = ['id', 'Công việc', 'Khách / Dự án', 'Ngày', 'Ưu tiên', 'Trạng thái', 'Ghi chú', 'Cập nhật'];
var COLS = HEADERS.length;

function doGet() {
  return reply_({ ok: true, message: 'Job API dang chay' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    lock.waitLock(20000);
    locked = true;
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!TOKEN || TOKEN === PLACEHOLDER) return reply_({ ok: false, error: 'token_not_set' });
    if (req.token !== TOKEN) return reply_({ ok: false, error: 'unauthorized' });

    var sheet = getSheet_();
    if (req.action === 'list') {
      return reply_({ ok: true, jobs: readAll_(sheet), sheetUrl: sheet.getParent().getUrl() });
    }
    if (req.action === 'create') return reply_({ ok: true, job: create_(sheet, req.job || {}) });
    if (req.action === 'update') return reply_({ ok: true, job: update_(sheet, req.id, req.patch || {}) });
    if (req.action === 'delete') {
      sheet.deleteRow(findRow_(sheet, req.id));
      return reply_({ ok: true });
    }
    return reply_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return reply_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, COLS).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(2, 320);
    sheet.setColumnWidth(7, 320);
  }
  return sheet;
}

function pad_(n) {
  n = String(n);
  return n.length < 2 ? '0' + n : n;
}

// Chấp nhận ô ngày là Date, "yyyy-MM-dd" hoặc "dd/MM/yyyy"; luôn trả về "yyyy-MM-dd".
function dateText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(v || '').trim();
  var p = s.split('/');
  if (p.length === 3 && p[2].length === 4) return p[2] + '-' + pad_(p[1]) + '-' + pad_(p[0]);
  return s.slice(0, 10);
}

function str_(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function toJob_(r) {
  return {
    id: String(r[0]),
    title: String(r[1]).trim(),
    client: String(r[2] || '').trim(),
    date: dateText_(r[3]),
    priority: String(r[4] || '').trim(),
    status: String(r[5] || '').trim(),
    note: String(r[6] || ''),
    updatedAt: r[7] instanceof Date ? r[7].toISOString() : String(r[7] || '')
  };
}

function readAll_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, COLS).getValues();
  var jobs = [];
  var ids = [];
  var missingId = false;
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var hasTitle = String(row[1]).trim() !== '';
    if (hasTitle && !row[0]) {
      row[0] = Utilities.getUuid(); // dòng bạn gõ tay trong Sheet: tự cấp id
      missingId = true;
    }
    ids.push([row[0]]);
    if (hasTitle) jobs.push(toJob_(row));
  }
  if (missingId) sheet.getRange(2, 1, ids.length, 1).setValues(ids);
  return jobs;
}

function findRow_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2 || !id) throw new Error('not_found');
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  throw new Error('not_found');
}

// Ghi cả dòng dưới dạng văn bản để nội dung bắt đầu bằng "=" không bị chạy như công thức.
function writeRow_(sheet, rowNum, row) {
  var range = sheet.getRange(rowNum, 1, 1, COLS);
  range.setNumberFormat('@');
  range.setValues([row]);
}

function create_(sheet, job) {
  var title = str_(job.title, 200);
  if (!title) throw new Error('missing_title');
  var row = [
    Utilities.getUuid(),
    title,
    str_(job.client, 100),
    dateText_(job.date),
    str_(job.priority, 20) || 'Vừa',
    str_(job.status, 20) || 'Cần làm',
    str_(job.note, 2000),
    new Date().toISOString()
  ];
  writeRow_(sheet, sheet.getLastRow() + 1, row);
  return toJob_(row);
}

function update_(sheet, id, patch) {
  var rowNum = findRow_(sheet, id);
  var row = sheet.getRange(rowNum, 1, 1, COLS).getValues()[0];
  var map = { title: [1, 200], client: [2, 100], date: [3, 10], priority: [4, 20], status: [5, 20], note: [6, 2000] };
  for (var key in map) {
    if (Object.prototype.hasOwnProperty.call(map, key) && Object.prototype.hasOwnProperty.call(patch, key)) {
      row[map[key][0]] = str_(patch[key], map[key][1]);
    }
  }
  if (!String(row[1]).trim()) throw new Error('missing_title');
  row[3] = dateText_(row[3]);
  row[7] = new Date().toISOString();
  writeRow_(sheet, rowNum, row);
  return toJob_(row);
}
`;
