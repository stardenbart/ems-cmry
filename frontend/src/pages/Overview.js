import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import MetricPanel, { formatNilai } from '../components/Common/MetricPanel';

// Halaman utama: satu komponen yang melayani seluruh tingkat pohon aset.
// Plant, gedung, line, sampai mesin memakai endpoint yang sama dengan node_id
// berbeda, sehingga menambah tingkat hierarki tidak menambah halaman baru.

const RANGE = [
  { key: 'today', label: 'Today' },
  { key: 'thisWeek', label: 'This week' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'thisYear', label: 'This year' },
];

const LABEL_KIND = {
  energy: 'Energy', power: 'Active Power', reactive_power: 'Reactive Power',
  apparent_power: 'Apparent Power', current: 'Current', voltage: 'Voltage',
  frequency: 'Frequency', power_factor: 'Power Factor', thd: 'THD',
  temperature: 'Temperature', pressure: 'Pressure', flow: 'Flow', other: 'Other',
};

function Overview() {
  const [tree, setTree] = useState([]);
  const [nodeId, setNodeId] = useState(null);
  const [range, setRange] = useState('today');
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    api.get('/assets/tree')
      .then((res) => {
        setTree(res.data);
        const akar = res.data.find((n) => n.parent_id === null);
        setNodeId(akar ? akar.id : null);
      })
      .catch(() => setStatus('Failed to load asset tree'));
  }, []);

  useEffect(() => {
    if (!nodeId) return;
    setStatus('loading');
    api.get(`/assets/${nodeId}/overview`, { params: { range } })
      .then((res) => { setData(res.data); setStatus(''); })
      .catch((e) => setStatus(e.response?.data?.error || 'Failed to load summary'));
  }, [nodeId, range]);

  // Jalur dari akar ke node terpilih, untuk navigasi menelusuri ke dalam.
  const jalur = [];
  if (nodeId && tree.length > 0) {
    const byId = {};
    tree.forEach((n) => { byId[n.id] = n; });
    let cur = byId[nodeId];
    while (cur) { jalur.unshift(cur); cur = cur.parent_id ? byId[cur.parent_id] : null; }
  }
  const anak = tree.filter((n) => n.parent_id === nodeId);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 className="page-title" style={{ margin: 0 }}>Overview</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGE.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              style={{
                padding: '5px 12px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                border: '1px solid ' + (range === r.key ? '#1B4F72' : '#ddd'),
                background: range === r.key ? '#1B4F72' : '#fff',
                color: range === r.key ? '#fff' : '#555',
              }}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* Jejak navigasi */}
      <div style={{ marginBottom: 12, fontSize: 13 }}>
        {jalur.map((n, i) => (
          <span key={n.id}>
            {i > 0 ? <span style={{ color: '#aaa' }}> › </span> : null}
            <button onClick={() => setNodeId(n.id)}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: i === jalur.length - 1 ? '#1B4F72' : '#7f8c8d',
                fontWeight: i === jalur.length - 1 ? 700 : 400, fontSize: 13,
              }}>{n.name}</button>
          </span>
        ))}
      </div>

      {status ? (
        <div className="card" style={{ padding: 20, color: '#7f8c8d' }}>{status}</div>
      ) : null}

      {data && !status ? (
        <>
          {/* Status sistem diletakkan paling atas: angka yang rapi tidak ada
              gunanya kalau ternyata sumber datanya sudah mati sejak tadi. */}
          <div className="card" style={{ padding: '12px 20px', marginBottom: 16, fontSize: 13 }}>
            <strong>{data.node?.name}</strong>
            <span style={{ color: '#7f8c8d' }}>
              {' '}· {data.deviceCount} device{data.deviceCount === 1 ? '' : 's'} counted · {data.nodeCount} node{data.nodeCount === 1 ? '' : 's'}
              {' '}· totals from: {data.rollupMode === 'incomer' ? 'incomer meter' : 'sum of feeders'}
            </span>
            {data.summary.some((s) => s.suspectCount > 0) ? (
              <span style={{ color: '#e67e22', marginLeft: 8 }}>
                ⚠ some data is flagged for review
              </span>
            ) : null}
          </div>

          {data.summary.length === 0 ? (
            <div className="card" style={{ padding: 20, color: '#95a5a6' }}>
              No data in this range yet.
            </div>
          ) : (
            <div className="rt-grid-4">
              {data.summary.map((s) => (
                <MetricPanel
                  key={`${s.kind}|${s.unit}`}
                  meta={{
                    name: LABEL_KIND[s.kind] || s.kind,
                    kind: s.kind,
                    unit: s.unit,
                    precision: s.agg === 'counter' ? 0 : 2,
                  }}
                  value={s.value}
                  suspect={s.suspectCount > 0}
                  // Satu sumber: sebutkan device dan parameternya, supaya jelas angka
                  // ini PF Total, bukan rata-rata PF per fasa.
                  subtitle={s.sources && s.sources.length === 1
                    ? `${s.sources[0].device} · ${s.sources[0].parameter}`
                    : `${s.agg === 'counter' ? 'total' : 'average'} of ${s.deviceCount} devices`}
                />
              ))}
            </div>
          )}

          {/* Menelusuri ke dalam */}
          {anak.length > 0 ? (
            <div className="card" style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 12 }}>
                Drill down
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr><th>Name</th><th>Level</th><th>Devices</th></tr></thead>
                  <tbody>
                    {anak.map((n) => (
                      <tr key={n.id} style={{ cursor: 'pointer' }} onClick={() => setNodeId(n.id)}>
                        <td style={{ color: '#1B4F72', fontWeight: 600 }}>{n.name}</td>
                        <td>{n.type}</td>
                        <td>{formatNilai(n.device_count, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default Overview;
