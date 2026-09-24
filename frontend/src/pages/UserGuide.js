import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Panduan pengguna. Ditulis untuk orang awam: setiap langkah menyebut menu yang
// diklik, apa yang diisi, dan cara memastikan hasilnya benar. Screenshot di
// /public/guide diambil otomatis dengan Playwright dari sistem produksi
// (lihat docs/TECHNICAL.md), jadi perbarui gambarnya setiap tampilan berubah.

const TOC = [
  { id: 'start', label: 'Getting started' },
  { id: 'desktop-app', label: 'Desktop app (EMS icon)' },
  { id: 'monitoring', label: 'Everyday monitoring' },
  { id: 'new-device', label: 'Set up a new device' },
  { id: 'examples', label: 'Worked examples' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
  { id: 'settings', label: 'Other settings' },
  { id: 'faq', label: 'FAQ' },
];

function Shot({ file, caption }) {
  const src = `/guide/${file}.jpg`;
  return (
    <figure style={{ margin: '14px 0 22px' }}>
      <a href={src} target="_blank" rel="noreferrer" title="Open full size">
        <img src={src} alt={caption} loading="lazy"
          style={{ width: '100%', border: '1px solid #dde3ea', borderRadius: 6, display: 'block' }} />
      </a>
      <figcaption style={{ fontSize: 12, color: '#7f8c8d', marginTop: 6 }}>{caption} — click to enlarge</figcaption>
    </figure>
  );
}

function Note({ kind = 'info', children }) {
  const warna = { info: ['#eaf2f8', '#1B4F72'], warn: ['#fef5e7', '#9c640c'], ok: ['#e9f7ef', '#1e8449'] }[kind];
  return (
    <div style={{ background: warna[0], color: warna[1], borderLeft: `4px solid ${warna[1]}`,
      padding: '10px 14px', borderRadius: 4, margin: '12px 0', fontSize: 13, lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function H2({ id, children }) {
  return <h2 id={id} style={{ fontSize: 20, color: '#1B4F72', margin: '36px 0 10px', scrollMarginTop: 80 }}>{children}</h2>;
}
function H3({ id, children }) {
  return <h3 id={id} style={{ fontSize: 16, color: '#1B2A4A', margin: '26px 0 8px', scrollMarginTop: 80 }}>{children}</h3>;
}

const p = { fontSize: 14, lineHeight: 1.7, color: '#333', margin: '8px 0' };
const li = { fontSize: 14, lineHeight: 1.7, color: '#333', marginBottom: 6 };

function UserGuide() {
  const location = useLocation();

  // Tautan seperti /guide#desktop-app langsung menggulir ke bagiannya.
  useEffect(() => {
    if (!location.hash) return;
    const t = setTimeout(() => {
      const el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => clearTimeout(t);
  }, [location.hash]);

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <nav className="card guide-toc" style={{ position: 'sticky', top: 76, minWidth: 210, padding: '14px 16px', flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', marginBottom: 8 }}>Contents</div>
        {TOC.map((t) => (
          <a key={t.id} href={`#${t.id}`}
            onClick={(e) => { e.preventDefault(); document.getElementById(t.id).scrollIntoView({ behavior: 'smooth' }); window.history.replaceState(null, '', `#${t.id}`); }}
            style={{ display: 'block', fontSize: 13, color: '#1B4F72', padding: '5px 0', textDecoration: 'none' }}>
            {t.label}
          </a>
        ))}
      </nav>

      <div className="card" style={{ flex: 1, minWidth: 0, padding: '8px 32px 32px', maxWidth: 1080 }}>
        <h1 className="page-title" style={{ marginTop: 18 }}>User Guide</h1>
        <p style={p}>
          EMS reads meters and sensors in the plant every few seconds, shows the live values, stores a sample every
          15 minutes, and turns those samples into daily and monthly totals, charts, reports and alarms. This guide
          explains every page, and walks through adding a new device step by step.
        </p>

        {/* ────────────────────────────────────────────────────────────── */}
        <H2 id="start">1. Getting started</H2>
        <p style={p}>
          Open <strong>http://172.104.1.81:3010</strong> in Edge or Chrome while connected to the plant network,
          then log in with the username and password given by your administrator.
        </p>
        <Shot file="01-login" caption="Login page" />

        <H3>First login: choose your own password</H3>
        <p style={p}>
          Accounts created by an administrator, and the built-in accounts, must change their password at the first
          login. EMS opens the <strong>Change Password</strong> page automatically and keeps you there until it is
          done. The new password needs at least 8 characters and must differ from the old password and the username.
        </p>
        <Shot file="38-change-password" caption="Change Password — also reachable any time from the button at the bottom of the menu" />

        <H3>The menu</H3>
        <p style={p}>
          The left menu holds everything. Items with ▶ open a sub-menu. <strong>Settings</strong> is grouped by
          purpose, and the first group — <strong>Devices &amp; Connection</strong> — is numbered in the order you
          must follow when adding a device. What you see depends on your role: operators and viewers do not see
          Settings.
        </p>
        <Shot file="19-menu-settings" caption="Settings opened, with the numbered device set-up group" />

        {/* ────────────────────────────────────────────────────────────── */}
        <H2 id="desktop-app">2. Desktop app (EMS icon)</H2>
        <p style={p}>
          EMS can be installed as an app, so it opens from an icon on the desktop or Start menu, in its own window,
          without typing the address. Nothing is downloaded: the browser creates the app from the EMS website, so
          every update on the server shows up in the app straight away.
        </p>
        <p style={p}><strong>Microsoft Edge</strong> (recommended, available on every Windows PC):</p>
        <ol>
          <li style={li}>Open EMS in Edge and log in.</li>
          <li style={li}>Click the <strong>⋯</strong> menu at the top right of Edge.</li>
          <li style={li}>Choose <strong>Apps</strong> → <strong>Install this site as an app</strong>.</li>
          <li style={li}>Keep the name <em>EMS</em> and click <strong>Install</strong>.</li>
          <li style={li}>In the window that follows, tick <strong>Create desktop shortcut</strong> and
            <strong> Pin to taskbar</strong>. Tick <strong>Auto-start on device login</strong> on the panel-room PC,
            so EMS opens by itself after the PC restarts.</li>
        </ol>
        <p style={p}><strong>Google Chrome:</strong> ⋮ menu → <strong>Cast, save, and share</strong> →
          <strong> Install page as app</strong> (on older versions: <em>More tools → Create shortcut</em>, tick
          <em> Open as window</em>).</p>
        <Note kind="info">
          The EMS server itself starts automatically when it is switched on — it runs as a Windows service and waits
          for its database — so after a power cut you only need to wait a minute and open the app again.
        </Note>
        <Note kind="warn">
          Do not download or run an <code>.exe</code> for EMS. Windows Smart App Control blocks unsigned programs,
          and the app install above does the same job without one.
        </Note>

        {/* ────────────────────────────────────────────────────────────── */}
        <H2 id="monitoring">3. Everyday monitoring</H2>

        <H3>Overview</H3>
        <p style={p}>
          The totals for the whole plant, a building, or a machine. Use the buttons at the top to switch between
          today, this week, this month and this year. Each card says which device and parameter it comes from.
          Click a row under <strong>Drill down</strong> to open a building or machine; the path at the top takes you
          back up.
        </p>
        <Shot file="02-overview" caption="Overview of Plant Sentul" />

        <H3>Device Monitor</H3>
        <p style={p}>All parameters of one device with their live values and a short history chart.</p>
        <Shot file="03-device-monitor" caption="Device Monitor" />

        <H3>Realtime Diagram</H3>
        <p style={p}>
          The live screen. Pick a device at the top. The cards show the current values and the charts show the last
          3 minutes, updating every few seconds. Energy meters also show energy today, this month and its
          conversion to CO₂, fuel and cost.
        </p>
        <Shot file="04-realtime-pm2200" caption="Realtime Diagram for the PM2200 energy meter" />
        <p style={p}>
          For temperature or pressure devices the page adds <strong>Channel statistics</strong>: current, lowest,
          highest and average value, how fast each channel is rising or falling, and the spread between channels
          — the things usually watched on a process: a point leaving its range, heating or cooling too fast, or
          measuring points that stop moving together.
        </p>
        <Shot file="05-realtime-jumo" caption="Realtime Diagram for the UHT 5000 temperature recorder" />
        <p style={p}>
          <strong>Configure cards &amp; charts</strong> lets you choose which parameters appear as cards
          (<em>Card</em>), their titles and order, and which get a live chart (<em>Chart</em>, up to 4, shown as
          separate charts in a 2 × 2 grid). The choice is saved for every device of the same type.
        </p>
        <Shot file="06-realtime-configure" caption="Choosing cards and charts" />

        <H3>Measurement Trends</H3>
        <p style={p}>
          History per kind of measurement — energy, power, temperature, pressure and so on — across all devices.
          A tab appears by itself as soon as a kind has stored data. Energy is shown as totals per hour or day;
          instant values such as temperature are shown as averages.
        </p>
        <Shot file="07-measurement-trends" caption="Measurement Trends" />

        <H3>Dashboards</H3>
        <p style={p}>
          The Dashboard menu keeps the classic energy views: energy per device, comparisons between periods, power,
          power quality, and group totals.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          <Shot file="08-dashboard-energy" caption="Dashboard → Device → Energy" />
          <Shot file="09-dashboard-comparison" caption="Dashboard → Device → Comparison" />
          <Shot file="10-dashboard-power" caption="Dashboard → Device → Power" />
          <Shot file="11-dashboard-pq" caption="Dashboard → Device → PQ" />
          <Shot file="12-group-energy" caption="Dashboard → Group → Total Energy" />
          <Shot file="13-group-comparison" caption="Dashboard → Group → Usage Comparison" />
          <Shot file="14-group-kva" caption="Dashboard → Group → KVA Trend" />
        </div>

        <H3>Reports and alarms</H3>
        <p style={p}>
          <strong>Report → Basic Report</strong> builds a table of stored values for a device and period that can be
          exported to Excel. <strong>Alarm</strong> lists alarms that fired; acknowledge them there.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          <Shot file="15-report-basic" caption="Report → Basic Report" />
          <Shot file="16-report-alarm" caption="Report → Alarm Report" />
          <Shot file="17-alarm-list" caption="Alarm" />
        </div>

        {/* ────────────────────────────────────────────────────────────── */}
        <H2 id="new-device">4. Set up a new device</H2>
        <p style={p}>
          Everything is done from the website — no programming. Follow the four numbered items under
          <strong> Settings → Devices &amp; Connection</strong> in order, because each step needs the one before it:
          a device must be told which connection to use and which register map to read.
        </p>

        <H3>Five words to know first</H3>
        <table className="data-table" style={{ fontSize: 13, margin: '10px 0 18px' }}>
          <thead><tr><th style={{ width: 170 }}>Word</th><th>Meaning</th><th style={{ width: 240 }}>Where you find it</th></tr></thead>
          <tbody>
            <tr><td><strong>Gateway</strong></td><td>The cable or network route EMS uses to reach devices: a COM port on the server (RS485 cable) or a MOXA box on the network.</td><td>Today: <em>MDP A-3 · COM2</em></td></tr>
            <tr><td><strong>Slave address</strong></td><td>The device's number on its cable, 1–247. Every device on the same cable needs a different number; on a different cable the numbers can repeat.</td><td>Communication menu on the meter's own screen</td></tr>
            <tr><td><strong>Baud rate &amp; parity</strong></td><td>The speed and check-bit setting of the cable. They must be <em>exactly</em> the same on EMS and on every device on that cable, or the device will not answer.</td><td>Today on COM2: <em>9600, None</em></td></tr>
            <tr><td><strong>Device type (Data Mapping)</strong></td><td>The list of registers to read for one model of device, with the unit of each value. Made once per model, shared by every device of that model.</td><td>The device's Modbus manual</td></tr>
            <tr><td><strong>Asset hierarchy</strong></td><td>Where the device sits: plant → building → line → machine. This decides which totals it counts in.</td><td>Your plant layout</td></tr>
          </tbody>
        </table>

        <H3 id="step-gateway">Step 1 — Data Gateway (the connection)</H3>
        <p style={p}>
          Skip this step if the device uses a connection that already exists — for example another meter on the
          COM2 cable in the MDP panel.
        </p>
        <Shot file="20-gateway" caption="Settings → Devices & Connection → 1. Data Gateway" />
        <ol>
          <li style={li}>Click <strong>Add Data Gateway</strong>.</li>
          <li style={li}><strong>Name</strong>: something you will recognise, e.g. <em>MOXA CMD 2</em>.</li>
          <li style={li}><strong>Protocol</strong>:
            <ul>
              <li style={li}><strong>Modbus RTU</strong> — an RS485 cable plugged into the server. Enter the COM port
                (see <em>Device Manager → Ports (COM &amp; LPT)</em> on the server), the baud rate and the parity.</li>
              <li style={li}><strong>Modbus TCP</strong> — a MOXA MGate on the network. Enter <em>IP:port</em>, e.g.
                <em> 10.10.1.21:502</em>. The IP is set when the MOXA is installed; ask IT for a fixed address.</li>
              <li style={li}><strong>Simulated</strong> — no hardware yet. EMS generates realistic test values so pages,
                charts and alarms can be prepared in advance.</li>
            </ul>
          </li>
          <li style={li}>Click <strong>Save</strong>.</li>
        </ol>
        <Shot file="21-gateway-add" caption="New gateway form" />
        <p style={p}>
          Click <strong>Test</strong> on the gateway row at any time. EMS opens the connection and asks every device
          on it for one value. <em>Replied</em> means cable, speed, parity and slave address are all right.
        </p>
        <Shot file="22-gateway-test" caption="Test result: the PM2200 replied in 28 ms" />

        <H3 id="step-mapping">Step 2 — Data Mapping (what to read)</H3>
        <p style={p}>
          Skip this step if the model already exists in the list — <em>PM2200</em> and <em>JUMO LOGOSCREEN 601</em>
          are there already. For a new model, click <strong>Add Data Mapping</strong> (or <strong>Import
          template</strong> if someone exported one), give it a name, and add one row per value to read.
        </p>
        <Shot file="23-data-mapping" caption="Settings → Devices & Connection → 2. Data Mapping" />
        <table className="data-table" style={{ fontSize: 13, margin: '10px 0 18px' }}>
          <thead><tr><th style={{ width: 150 }}>Column</th><th>What to enter</th></tr></thead>
          <tbody>
            <tr><td><strong>Name</strong></td><td>A fixed name for the value, e.g. <em>Active Power Total</em>. Do not rename it later — stored history is linked to this name. Use <em>Card label</em> for the display name instead.</td></tr>
            <tr><td><strong>Card label</strong></td><td>The name shown on cards and charts. Change it freely.</td></tr>
            <tr><td><strong>Address</strong></td><td>The register number from the manual <strong>minus 1</strong> (manual register 3060 → address 3059).</td></tr>
            <tr><td><strong>Len / Data type</strong></td><td>How many registers the value uses and how to read them. A float32 value uses 2 registers.</td></tr>
            <tr><td><strong>Quantity / Unit</strong></td><td>What the value is (current, voltage, temperature…) and its unit. This decides the icon, the grouping in Measurement Trends, and the unit shown.</td></tr>
            <tr><td><strong>Aggregation</strong></td><td><em>gauge</em> for instant values (power, temperature) — averaged per period. <em>counter</em> for running totals (energy kWh) — the increase per period is added up.</td></tr>
            <tr><td><strong>Save / Featured</strong></td><td><em>Save</em> stores the value every 15 minutes. <em>Featured</em> shows it as a card.</td></tr>
            <tr><td><strong>More</strong></td><td>Conversion (scale/offset, or the Schneider power-factor rule), plausible min/max (values outside are flagged), decimals, read rate and order.</td></tr>
          </tbody>
        </table>
        <Note kind="ok">
          Not sure an address is right? Choose the <strong>Gateway for test reads</strong> and <strong>Slave ID</strong> at
          the top, then click <strong>Read</strong> on the row. EMS reads that register now and shows it decoded in
          every data type; pick the one that matches the number on the device's own screen.
        </Note>
        <Shot file="24-data-mapping-edit" caption="Editing the PM2200 register map" />

        <H3 id="step-device">Step 3 — Device (the meter itself)</H3>
        <Shot file="25-device" caption="Settings → Devices & Connection → 3. Device" />
        <ol>
          <li style={li}>Click <strong>Add Device</strong>.</li>
          <li style={li}><strong>Device Name</strong>: e.g. <em>PM CMD-2</em>.</li>
          <li style={li}><strong>Slave Address</strong>: the number set on the device (see the table above).</li>
          <li style={li}><strong>Device Type</strong>: the model from step 2.</li>
          <li style={li}><strong>Data Gateway</strong>: the connection from step 1.</li>
          <li style={li}><strong>Asset Location</strong> and <strong>Rollup Role</strong> can be set here or in step 4.</li>
          <li style={li}>Click <strong>Save</strong>. EMS starts reading it on the next cycle — no restart needed.</li>
        </ol>
        <Shot file="26-device-add" caption="New device form" />

        <H3 id="step-assets">Step 4 — Asset Hierarchy (where it counts)</H3>
        <p style={p}>
          Build the tree from the top: <strong>+ Add Plant</strong>, then use the <strong>+ Add … under</strong> button
          on a row to add a building under the plant, a line or machine under the building, and so on. Levels can
          be skipped: a machine can sit directly under a building.
        </p>
        <Shot file="27-assets" caption="Settings → Devices & Connection → 4. Asset Hierarchy" />
        <Shot file="28-assets-add" caption="Adding a building under Plant Sentul" />
        <p style={p}>Each device row under a node has two choices:</p>
        <table className="data-table" style={{ fontSize: 13, margin: '10px 0 18px' }}>
          <thead><tr><th style={{ width: 150 }}>Role</th><th>Use it for</th></tr></thead>
          <tbody>
            <tr><td><strong>Incomer</strong></td><td>The main meter of a building or panel. When a node has an incomer, its total is that meter alone.</td></tr>
            <tr><td><strong>Feeder</strong></td><td>A meter for part of the load (a line, a machine). Feeders are added up when there is no incomer.</td></tr>
            <tr><td><strong>Excluded</strong></td><td>A test or duplicate meter that must never be counted.</td></tr>
          </tbody>
        </table>
        <Note kind="info">
          Without incomer/feeder a main panel and its sub-panels would both be added up and the building would show
          double the energy. When a node has both, the difference (incomer minus feeders) is shown as unallocated
          consumption — losses or loads without their own meter.
        </Note>

        <H3 id="step-check">Step 5 — Check it works</H3>
        <ol>
          <li style={li}>Settings → <strong>1. Data Gateway</strong> → <strong>Test</strong> on its gateway: the new device must say <em>Replied</em>.</li>
          <li style={li}><strong>Realtime Diagram</strong> → select the device: the cards must show numbers that match the device's own screen.</li>
          <li style={li}>After the next quarter hour, <strong>Overview</strong> of its building shows it in the totals.</li>
        </ol>

        {/* ────────────────────────────────────────────────────────────── */}
        <H2 id="examples">5. Worked examples</H2>

        <H3>A. A second PM2200 for building CMD 2, on the same COM2 cable</H3>
        <ol>
          <li style={li}>On the new meter's screen, open its communication settings: <strong>slave address 2</strong>, <strong>9600</strong> baud, parity <strong>None</strong> (the same as COM2).</li>
          <li style={li}>Wire it to the same RS485 cable, A to A and B to B, in a chain — not a star.</li>
          <li style={li}>Step 1 and 2 are already done (gateway <em>MDP A-3</em>, type <em>PM2200</em>).</li>
          <li style={li}>Step 3: Add Device — name <em>PM CMD-2</em>, slave address <em>2</em>, type <em>PM2200</em>, gateway <em>MDP A-3</em>.</li>
          <li style={li}>Step 4: under Plant Sentul add building <em>CMD 2</em>; put <em>PM CMD-2</em> in it with role <em>Incomer</em>.</li>
          <li style={li}>Step 5: Test must show both meters as <em>Replied</em>.</li>
        </ol>

        <H3>B. Switching the UHT 5000 temperature recorder from test values to real data</H3>
        <ol>
          <li style={li}>On the JUMO LOGOSCREEN 601, set its RS485/Ethernet interface to <strong>Modbus slave</strong> and note its slave address, baud rate and parity.</li>
          <li style={li}>Settings → 1. Data Gateway → <strong>Edit</strong> on <em>JUMO UHT 5000</em>. Change <em>Simulated</em> to <em>Modbus TCP</em> (through a MOXA MGate: enter its IP:502) or <em>Modbus RTU</em> (cable to a COM port). Save.</li>
          <li style={li}>Settings → 2. Data Mapping → Edit <em>JUMO LOGOSCREEN 601</em>. Use <strong>Read</strong> on each channel and compare with the recorder's screen; correct the addresses if needed. The current addresses are placeholders until JUMO's Modbus interface description is available.</li>
          <li style={li}>Test the gateway. The same device keeps its place in UHT 5000 and switches to real values immediately.</li>
        </ol>

        {/* ────────────────────────────────────────────────────────────── */}
        <H2 id="troubleshooting">6. Troubleshooting</H2>
        <table className="data-table" style={{ fontSize: 13, margin: '10px 0 18px' }}>
          <thead><tr><th style={{ width: 280 }}>What you see</th><th>What to check</th></tr></thead>
          <tbody>
            <tr><td>Test says <strong>Port could not be opened</strong></td><td>The COM port or IP:port is wrong, the MOXA is off or not on the network, or another program holds the COM port.</td></tr>
            <tr><td>Test says <strong>No reply</strong></td><td>Slave address, baud rate and parity must match the device exactly. Check the A/B wires and the 120 Ω terminating resistors at both ends of the cable.</td></tr>
            <tr><td>Test says <strong>Replied with a Modbus exception</strong></td><td>The connection is fine; the register address does not exist on that device. Check the address in Data Mapping (manual number minus 1).</td></tr>
            <tr><td>Values are wildly off (×1000, ×65536, nonsense)</td><td>Wrong data type or unit. Use <strong>Read</strong> in Data Mapping and choose the data type that matches the device screen; set the unit or the scale under <strong>More</strong>.</td></tr>
            <tr><td>A device went quiet but others still work</td><td>EMS pauses a device that stops answering (30 s, growing to 5 min) so it does not slow the others. It resumes by itself once the device answers; <strong>Test</strong> checks it immediately.</td></tr>
            <tr><td>A building total looks doubled</td><td>Check the roles in Asset Hierarchy: the main meter should be <em>Incomer</em>, sub-meters <em>Feeder</em>.</td></tr>
            <tr><td>A card shows ⚠</td><td>Some stored values were outside the plausible min/max set in Data Mapping. They are kept and counted, and flagged for review.</td></tr>
          </tbody>
        </table>

        {/* ────────────────────────────────────────────────────────────── */}
        <H2 id="settings">7. Other settings</H2>

        <H3>Units &amp; Conversion</H3>
        <p style={p}>
          <strong>Units</strong> lists every unit and how it converts to its base unit (base = value × factor +
          offset), with a box to try a conversion. Values are stored as the device sends them, so correcting a
          factor here also corrects all history. <strong>Energy Conversion</strong> sets the CO₂, fuel and cost
          per kWh used on the Realtime Diagram.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          <Shot file="30-units" caption="Units" />
          <Shot file="31-energy-conversion" caption="Energy Conversion" />
        </div>

        <H3>Alarms &amp; Email</H3>
        <p style={p}>
          <strong>Alarm Rules</strong> builds alarms without programming: pick a device (or a whole node), a
          parameter, a condition such as <em>&gt; 85</em>, and a <strong>hold time</strong> — how long the condition
          must last before the alarm fires, so a one-second spike does not wake anyone. Rules can be limited to a
          time window and send email to the listed recipients. <strong>SMTP</strong> sets the email server used to
          send them. <em>Alarm (legacy)</em> keeps the older simple thresholds.
        </p>
        <Shot file="32-alarm-rules" caption="Alarm Rules" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          <Shot file="33-alarm-legacy" caption="Alarm (legacy)" />
          <Shot file="34-smtp" caption="SMTP (email server)" />
        </div>

        <H3>Production Calendar</H3>
        <p style={p}>
          <strong>Shifts &amp; Calendar</strong> records the shift times and the days the plant does not produce
          (holidays, shutdowns, maintenance). It prepares consumption per shift and fair comparisons — a holiday
          should not be compared with a working day. A shift that crosses midnight belongs to the day it starts.
        </p>
        <Shot file="35-shifts-calendar" caption="Shifts & Calendar" />

        <H3>Users &amp; Access</H3>
        <p style={p}>
          <strong>User Management</strong> adds users; the password you type there is temporary and the user must
          change it at first login. <strong>Roles &amp; Permissions</strong> combines permissions into roles and
          assigns them to users — for the whole plant or only one building and everything under it.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          <Shot file="36-users" caption="User Management" />
          <Shot file="37-roles" caption="Roles & Permissions" />
        </div>
        <p style={p}><em>Grouping (legacy)</em> is the old flat grouping, kept for the Group dashboards. New structure belongs in Asset Hierarchy.</p>
        <Shot file="29-grouping-legacy" caption="Grouping (legacy)" />

        {/* ────────────────────────────────────────────────────────────── */}
        <H2 id="faq">8. FAQ</H2>
        <p style={p}><strong>Is there a limit on parameters per device?</strong> No. Data Mapping accepts any number of rows. Modbus reads up to 125 registers at a time, and EMS groups them automatically.</p>
        <p style={p}><strong>How many meters can share one RS485 cable?</strong> About 5–6 PM2200s stay responsive at 9600 baud with a 3-second update; the electrical limit is 32 devices and ~1,200 m of cable. For a far-away building, a separate MOXA is tidier.</p>
        <p style={p}><strong>Do I need to restart anything after changing settings?</strong> No. Changes are applied at the next read cycle.</p>
        <p style={p}><strong>What happens during a power cut?</strong> The server starts EMS and its database automatically when it comes back. Data from the minutes while it was off is missing; energy totals stay correct because meters keep counting and EMS spreads the increase over the gap.</p>
        <p style={p}><strong>Who do I contact?</strong> Digital Transformation, Plant Sentul.</p>
      </div>
    </div>
  );
}

export default UserGuide;
