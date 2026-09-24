// Pengelompokan register menjadi blok — fungsi murni, tanpa perangkat.
//
// Modbus mengizinkan membaca sampai 125 register sekali jalan. 24 parameter
// PM2200 hanya menempati sekitar 5 rentang berdekatan, jadi 24 permintaan bisa
// jadi 5. Selain lebih cepat, ini mengurangi peluang timeout — dan timeout itu
// yang menggeser buffer lalu membuat energi terbaca x65536 selama 21 jam.
//
// Kelas laju polling ikut diperhitungkan: parameter dengan poll_class berbeda
// tidak digabung, supaya blok lambat benar-benar bisa dilewati.

const MAX_SPAN = 125;   // batas protokol Modbus
const MAX_GAP = 8;      // register menganggur yang masih layak ikut dibaca

// Berapa siklus sekali sebuah kelas dibaca.
const CLASS_EVERY = { fast: 1, normal: 2, slow: 10 };

function classOf(param) {
  const c = param.poll_class;
  return CLASS_EVERY[c] ? c : 'normal';
}

// Bangun daftar blok dari parameter sebuah device.
// Setiap blok: { start, length, pollClass, params: [{ param, offset }] }
function buildBlocks(params, { maxSpan = MAX_SPAN, maxGap = MAX_GAP } = {}) {
  const usable = (params || []).filter(
    (p) => Number.isFinite(Number(p.address)) && Number(p.length || 2) > 0
  );

  const byClass = {};
  for (const p of usable) {
    const c = classOf(p);
    (byClass[c] = byClass[c] || []).push(p);
  }

  const blocks = [];
  for (const [pollClass, list] of Object.entries(byClass)) {
    const sorted = [...list].sort((a, b) => Number(a.address) - Number(b.address));
    let cur = null;

    for (const p of sorted) {
      const start = Number(p.address);
      const len = Number(p.length || 2);
      const end = start + len;

      if (cur && start >= cur.start && (start - cur.end) <= maxGap && (end - cur.start) <= maxSpan) {
        cur.end = Math.max(cur.end, end);
        cur.params.push({ param: p, offset: start - cur.start });
      } else {
        if (cur) blocks.push(cur);
        cur = { start, end, pollClass, params: [{ param: p, offset: 0 }] };
      }
    }
    if (cur) blocks.push(cur);
  }

  return blocks
    .map((b) => ({ start: b.start, length: b.end - b.start, pollClass: b.pollClass, params: b.params }))
    .sort((a, b) => a.start - b.start);
}

// Apakah blok ini dibaca pada siklus ke-n?
function dueAtCycle(block, cycle) {
  const every = CLASS_EVERY[block.pollClass] || 1;
  return cycle % every === 0;
}

// Berapa permintaan yang dihemat dibanding membaca satu per satu.
function savings(params) {
  const blocks = buildBlocks(params);
  const before = (params || []).length;
  return { before, after: blocks.length, blocks };
}

module.exports = { buildBlocks, dueAtCycle, savings, CLASS_EVERY, MAX_SPAN, MAX_GAP };
