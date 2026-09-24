import React from 'react';
import { MdSpeed, MdElectricMeter, MdThermostat, MdCompress, MdWaterDrop, MdShowChart } from 'react-icons/md';
import { BsLightningChargeFill } from 'react-icons/bs';

// Panel dirakit dari metadata parameter, bukan ditulis per jenis besaran.
// Menambah sensor pressure atau temperature tidak memerlukan komponen baru —
// cukup isi `kind` dan `agg` pada mapping, tampilannya menyesuaikan sendiri.

const IKON = {
  power: BsLightningChargeFill,
  energy: BsLightningChargeFill,
  current: MdSpeed,
  voltage: MdElectricMeter,
  frequency: MdElectricMeter,
  power_factor: MdShowChart,
  reactive_power: MdShowChart,
  apparent_power: MdShowChart,
  temperature: MdThermostat,
  pressure: MdCompress,
  flow: MdWaterDrop,
  thd: MdShowChart,
};

// Nilai di luar batas wajar diberi warna, supaya penyimpangan langsung terlihat
// tanpa harus membuka chart.
function warnaStatus(value, meta) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const v = Number(value);
  if (meta.min !== null && meta.min !== undefined && v < Number(meta.min)) return '#c0392b';
  if (meta.max !== null && meta.max !== undefined && v > Number(meta.max)) return '#c0392b';
  return null;
}

// Simbol satuan untuk tampilan. Satuan suhu disimpan sebagai 'degC'/'degF'
// supaya aman dari masalah encoding; di layar tetap ditulis dengan simbol derajat.
const SIMBOL = { degC: '°C', degF: '°F', '-': '' };
export function tampilSatuan(unit) {
  if (!unit) return '';
  return SIMBOL[unit] !== undefined ? SIMBOL[unit] : unit;
}

export function formatNilai(value, precision) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const d = precision === undefined || precision === null ? 2 : precision;
  return Number(value).toLocaleString('id-ID', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function MetricPanel({ meta, value, suspect, subtitle }) {
  const Icon = IKON[meta.kind] || MdShowChart;
  const warna = warnaStatus(value, meta);
  const satuan = tampilSatuan(meta.unit);

  return (
    <div className="rt-card" title={suspect ? 'Some of this data is flagged for review' : undefined}>
      <div className="rt-card-info">
        <div className="rt-card-label">
          {meta.label || meta.name}
          {suspect ? <span style={{ marginLeft: 6, color: '#e67e22' }} title="data suspect">⚠</span> : null}
        </div>
        <div className="rt-card-value" style={warna ? { color: warna } : undefined}>
          {formatNilai(value, meta.precision)}
          {satuan ? <span className="rt-card-unit">{satuan}</span> : null}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 2 }}>{subtitle}</div>
        ) : null}
      </div>
      <div className="rt-card-icon" style={{ background: '#1B2A4A' }}>
        <Icon size={24} color="#fff" />
      </div>
    </div>
  );
}

// Urutkan parameter menurut metadata: yang ditandai featured tampil lebih dulu,
// lalu mengikuti `order`. Mengubah susunan kartu cukup lewat Data Mapping.
export function urutkanParameter(params) {
  return [...(params || [])].sort((a, b) => {
    if (!!b.featured !== !!a.featured) return b.featured ? 1 : -1;
    const oa = a.order === undefined ? 999 : a.order;
    const ob = b.order === undefined ? 999 : b.order;
    if (oa !== ob) return oa - ob;
    return String(a.name).localeCompare(String(b.name));
  });
}

export default MetricPanel;
