"""Ambil ulang screenshot User Guide (frontend/public/guide) dari server EMS.

    pip install playwright            (browser: Edge yang sudah terpasang)
    set EMS_GUIDE_USER=<username admin>
    set EMS_GUIDE_PASSWORD=<password>
    python tools/guide_screenshots.py frontend/public/guide

Pakai akun admin yang sudah mengganti password bawaannya. Nama akun di header
diganti "Administrator" dan isian SMTP dikosongkan sebelum setiap tangkapan,
supaya tidak ada nama akun atau alamat server email yang ikut terpublikasi.
Tidak ada yang disimpan: form hanya dibuka, tombol Save tidak pernah diklik.
"""
import json, os, sys, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get('EMS_URL', 'http://172.104.1.81:3010')
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
USERNAME = os.environ['EMS_GUIDE_USER']
PW = os.environ['EMS_GUIDE_PASSWORD']

req = urllib.request.Request(BASE + '/api/auth/login', method='POST',
    data=json.dumps({'username': USERNAME, 'password': PW}).encode(),
    headers={'Content-Type': 'application/json'})
sesi = json.loads(urllib.request.urlopen(req).read())
TOKEN, USER = sesi['token'], sesi['user']
POLISH_ARGS = (json.dumps(USER.get('name') or ''), json.dumps(USERNAME))

POLISH = """
() => {
  const nama = %s;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const ganti = [];
  while (w.nextNode()) if (nama && w.currentNode.nodeValue.includes(nama)) ganti.push(w.currentNode);
  ganti.forEach((n) => { n.nodeValue = n.nodeValue.replace(nama, 'Administrator'); });
  if (!document.getElementById('no-anim')) {
    const s = document.createElement('style'); s.id = 'no-anim';
    s.textContent = '.sidebar, .sidebar * { transition: none !important; animation: none !important; }';
    document.head.appendChild(s);
  }
  document.querySelectorAll('tr').forEach((tr) => {
    if (tr.textContent.includes(%s)) tr.remove();
  });
  if (location.pathname.startsWith('/settings/smtp')) {
    document.querySelectorAll('input').forEach((i) => {
      if (i.type !== 'number' && i.type !== 'password') i.value = i.value ? 'smtp.example.com' : '';
    });
  }
}
"""

hasil = []

def shot(page, name, full=True):
    page.evaluate(POLISH % POLISH_ARGS)
    time.sleep(0.4)
    path = os.path.join(OUT, name + '.jpg')
    page.screenshot(path=path, full_page=full, type='jpeg', quality=78)
    hasil.append((name, os.path.getsize(path)))
    print('  saved', name, os.path.getsize(path) // 1024, 'KB', flush=True)

def buka(page, path, tunggu=2.5):
    page.goto(BASE + path, wait_until='networkidle')
    time.sleep(tunggu)

def klik_teks(page, teks, exact=False, nth=0):
    page.get_by_text(teks, exact=exact).nth(nth).click()
    time.sleep(1.2)

def aman(nama, fn):
    try:
        fn()
    except Exception as e:
        print('  GAGAL', nama, str(e).splitlines()[0][:160], flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)

    # ── Login (tanpa sesi) ────────────────────────────────────────────────
    ctx0 = browser.new_context(viewport={'width': 1440, 'height': 900})
    pg0 = ctx0.new_page()
    aman('login', lambda: (buka(pg0, '/login', 1.5), shot(pg0, '01-login', full=False)))
    ctx0.close()

    # ── Dengan sesi ───────────────────────────────────────────────────────
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_init_script(
        "localStorage.setItem('ems_token', %s); localStorage.setItem('ems_user', %s);"
        % (json.dumps(TOKEN), json.dumps(json.dumps(USER))))
    pg = ctx.new_page()

    polos = [
        ('02-overview', '/overview', 3),
        ('03-device-monitor', '/device', 4),
        ('07-measurement-trends', '/dashboard/trends', 4),
        ('08-dashboard-energy', '/dashboard/energy', 4),
        ('09-dashboard-comparison', '/dashboard/comparison', 4),
        ('10-dashboard-power', '/dashboard/power', 4),
        ('11-dashboard-pq', '/dashboard/pq', 4),
        ('12-group-energy', '/dashboard/group/energy', 4),
        ('13-group-comparison', '/dashboard/group/comparison', 4),
        ('14-group-kva', '/dashboard/group/kva', 4),
        ('15-report-basic', '/report/basic', 3),
        ('16-report-alarm', '/report/alarm', 3),
        ('17-alarm-list', '/alarm', 3),
        ('20-gateway', '/settings/gateway', 2.5),
        ('23-data-mapping', '/settings/data-mapping', 2.5),
        ('25-device', '/settings/device', 2.5),
        ('27-assets', '/settings/assets', 2.5),
        ('29-grouping-legacy', '/settings/grouping', 2.5),
        ('30-units', '/settings/units', 2.5),
        ('31-energy-conversion', '/settings/energy-conversion', 2.5),
        ('32-alarm-rules', '/settings/alarm-rules', 2.5),
        ('33-alarm-legacy', '/settings/alarm', 2.5),
        ('34-smtp', '/settings/smtp', 2.5),
        ('35-shifts-calendar', '/settings/shift', 2.5),
        ('36-users', '/settings/users', 2.5),
        ('37-roles', '/settings/roles', 2.5),
        ('38-change-password', '/change-password', 2),
    ]
    for nama, path, t in polos:
        aman(nama, lambda: (buka(pg, path, t), shot(pg, nama)))

    # Realtime: PM2200 lalu JUMO, beri waktu grafik live terisi.
    def realtime():
        buka(pg, '/realtime/device', 22)
        shot(pg, '04-realtime-pm2200')
        pg.locator('select.selector-select').first.select_option(label='UHT 5000')
        time.sleep(25)
        shot(pg, '05-realtime-jumo')
        klik_teks(pg, 'Configure cards & charts')
        shot(pg, '06-realtime-configure')
    aman('realtime', realtime)

    # Menu Settings terbuka.
    def menu():
        buka(pg, '/overview', 2)
        pg.locator('.sidebar-item', has_text='Settings').first.click(); time.sleep(0.8)
        pg.locator('.sidebar-item', has_text='Devices & Connection').first.click(); time.sleep(0.8)
        pg.set_viewport_size({'width': 1440, 'height': 900})
        shot(pg, '19-menu-settings', full=False)
    aman('menu', menu)

    def gateway_add():
        buka(pg, '/settings/gateway', 2)
        klik_teks(pg, 'Add Data Gateway', exact=True)
        shot(pg, '21-gateway-add')
    aman('gateway-add', gateway_add)

    def gateway_test():
        buka(pg, '/settings/gateway', 2)
        pg.get_by_role('button', name='Test', exact=True).first.click()
        pg.get_by_text('Connection test —').wait_for(timeout=20000)
        time.sleep(0.8)
        shot(pg, '22-gateway-test')
    aman('gateway-test', gateway_test)

    def mapping_edit():
        buka(pg, '/settings/data-mapping', 2)
        pg.locator('tr', has_text='PM2200').get_by_role('button', name='Edit').first.click()
        time.sleep(1.5)
        shot(pg, '24-data-mapping-edit')
    aman('mapping-edit', mapping_edit)

    def device_add():
        buka(pg, '/settings/device', 2)
        klik_teks(pg, 'Add Device', exact=True)
        shot(pg, '26-device-add')
    aman('device-add', device_add)

    def assets_add():
        buka(pg, '/settings/assets', 2)
        pg.locator('tr', has_text='Plant Sentul').get_by_role('button', name='under').first.click()
        time.sleep(1)
        shot(pg, '28-assets-add')
    aman('assets-add', assets_add)

    ctx.close()
    browser.close()

print('selesai', len(hasil), 'gambar,', sum(s for _, s in hasil) // 1024, 'KB total')
