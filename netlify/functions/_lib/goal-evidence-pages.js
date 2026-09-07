"use strict";

// PostgREST limits individual responses. Never average a truncated quarter.
// Every caller supplies a stable order and an already-authorized scope.
async function readAllPages(url, readPage, pageSize = 500) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set("limit", String(pageSize));
    pageUrl.searchParams.set("offset", String(offset));
    const page = await readPage(pageUrl.toString());
    if (!Array.isArray(page)) throw new Error("Invalid evidence page");
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function chunks(values, size = 100) {
  const result = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

module.exports = { readAllPages, chunks };
