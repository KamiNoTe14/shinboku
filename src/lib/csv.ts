// Minimal CSV reading and writing (RFC 4180): commas, quoted fields, doubled quotes,
// and either Windows or Unix line endings. Handles files saved by Excel and Google Sheets.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, ""); // Excel's byte-order mark

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully blank lines (common at the end of files).
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

function escapeField(v: string): string {
  // Also guard against spreadsheet formula injection from values like "=cmd".
  const safe = /^[=+\-@]/.test(v) && !/^-?\d/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map((v) => escapeField(v == null ? "" : String(v))).join(",")).join("\r\n") + "\r\n";
}
