/**
 * Converts an array of objects to a CSV string.
 * @param {Array} data - Array of objects to convert
 * @param {Array} headers - Optional array of header objects { label: 'Header', key: 'key' }
 * @returns {string} - CSV string
 */
const convertToCSV = (data, headers) => {
  if (!data || !data.length) return '';

  const columns = headers || Object.keys(data[0]).map(k => ({ label: k, key: k }));
  
  const headerRow = columns.map(col => `"${col.label}"`).join(',');
  
  const rows = data.map(item => {
    return columns.map(col => {
      let val = item[col.key];
      if (val === null || val === undefined) val = '';
      if (typeof val === 'string') {
        val = val.replace(/"/g, '""'); // Escape quotes
        return `"${val}"`;
      }
      return val;
    }).join(',');
  });

  return [headerRow, ...rows].join('\n');
};

module.exports = { convertToCSV };
