import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

/**
 * Export data ke Excel.
 * Mendukung 2 format:
 *   1. Array of objects biasa: [{date, device, parameter, value}]
 *   2. Chart data (label + value): [{period, total}] atau [{time, power}] atau [{day, kWh}]
 */
export function exportToExcel(data, filename = 'export') {
  if (!data || data.length === 0) {
    alert('Tidak ada data untuk di-export');
    return;
  }

  // Detect format dan transform
  let formatted;
  const keys = Object.keys(data[0]);

  if (keys.includes('date') && keys.includes('parameter')) {
    // Format Basic Report
    formatted = data.map((row) => ({
      'Date': row.date ? new Date(row.date).toLocaleString('id-ID') : '',
      'Device': row.device || '',
      'Parameter': row.parameter || '',
      'Value': row.value !== null && row.value !== undefined ? parseFloat(row.value) : '',
    }));
  } else if (keys.includes('triggered_at') && keys.includes('alarm_name')) {
    // Format Alarm Report
    formatted = data.map((row) => ({
      'Date': row.triggered_at ? new Date(row.triggered_at).toLocaleString('id-ID') : '',
      'Alarm Name': row.alarm_name || '',
      'Device': row.device_name || '',
      'Message': row.message || '',
      'Acknowledged At': row.acknowledged_at ? new Date(row.acknowledged_at).toLocaleString('id-ID') : '-',
      'Acknowledged By': row.acknowledged_by || '-',
    }));
  } else {
    // Format Chart/Dashboard data — capture label (datetime) + value
    // Cari key yang paling mirip label dan value
    const labelKey = keys.find(k => ['period', 'time', 'day', 'date', 'label', 'month'].includes(k)) || keys[0];
    const valueKey = keys.find(k => ['total', 'power', 'kWh', 'kW', 'value', 'current', 'previous'].includes(k)) || keys[1];

    // Kalau ada 'current' dan 'previous' (comparison chart)
    if (keys.includes('current') && keys.includes('previous')) {
      formatted = data.map((row) => ({
        'Label': row[labelKey] || '',
        'Current': row.current !== null && row.current !== undefined ? parseFloat(row.current) : 0,
        'Previous': row.previous !== null && row.previous !== undefined ? parseFloat(row.previous) : 0,
      }));
    } else {
      formatted = data.map((row) => {
        const label = row[labelKey];
        const val = row[valueKey];
        return {
          'Label': typeof label === 'string' ? label : (label instanceof Date ? label.toLocaleString('id-ID') : String(label || '')),
          'Data': val !== null && val !== undefined ? parseFloat(val) : 0,
        };
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(formatted);

  // Auto column widths
  const colWidths = Object.keys(formatted[0] || {}).map((key) => {
    const maxLen = Math.max(
      key.length,
      ...formatted.map(r => String(r[key] || '').length)
    );
    return { wch: Math.min(maxLen + 2, 30) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}