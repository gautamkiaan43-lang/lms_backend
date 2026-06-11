/** Fixed DD/MM/YYYY in local server timezone (same rules as frontend). */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDateIN(value, emptyLabel = 'N/A') {
  if (value == null || value === '') return emptyLabel;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return emptyLabel;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

module.exports = { formatDateIN };
