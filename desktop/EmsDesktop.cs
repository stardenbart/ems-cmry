// EMS Desktop — peluncur kecil untuk membuka EMS sebagai aplikasi desktop.
//
// Bukan aplikasi terpisah: EMS tetap berjalan di server, dan exe ini hanya
// membuka halamannya di jendela sendiri (Edge/Chrome mode --app, tanpa address
// bar dan tab), dengan profil browser terpisah supaya login tersimpan dan
// jendelanya punya ikon sendiri di taskbar. Karena itu setiap perbaikan di
// server langsung terlihat di desktop tanpa perlu memasang ulang exe ini.
//
// Saat pertama dijalankan dari folder Download, exe menyalin dirinya ke
// %LOCALAPPDATA%\EMS dan membuat shortcut di Desktop dan Start Menu.
//
// Dikompilasi dengan csc.exe bawaan .NET Framework 4 (ada di setiap Windows
// 10/11) lewat desktop/build.ps1 — tidak butuh Visual Studio.
using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("EMS - Energy Monitoring System")]
[assembly: AssemblyProduct("EMS Desktop")]
[assembly: AssemblyCompany("PT Cisarua Mountain Dairy Tbk - Plant Dept.")]
[assembly: AssemblyVersion("1.0.0.0")]

static class EmsDesktop
{
    // Alamat server bawaan. Bisa ditimpa tanpa kompilasi ulang dengan menaruh
    // satu baris URL di %LOCALAPPDATA%\EMS\server.txt (mis. saat IP server pindah).
    const string DefaultUrl = "http://172.104.1.81:3010/";
    const string AppName = "EMS - Energy Monitoring";

    static readonly string Home = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EMS");

    [STAThread]
    static void Main(string[] args)
    {
        try
        {
            Directory.CreateDirectory(Home);
            string installed = Install();
            string url = ReadUrl();

            // Server boleh belum siap (baru menyala setelah mati listrik). Beri
            // kesempatan menunggu alih-alih membuka jendela kosong.
            while (!Reachable(url))
            {
                DialogResult r = MessageBox.Show(
                    "The EMS server is not reachable yet:\n" + url +
                    "\n\nIf the server was just switched on, wait a minute and press Retry." +
                    "\nIf this keeps happening, check that this PC is on the plant network.",
                    AppName, MessageBoxButtons.RetryCancel, MessageBoxIcon.Warning);
                if (r != DialogResult.Retry) return;
            }

            Open(url);

            if (installed != null)
            {
                MessageBox.Show(
                    "EMS is installed. Next time, open it from the \"" + AppName +
                    "\" icon on your desktop or in the Start menu.",
                    AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
        catch (Exception e)
        {
            MessageBox.Show("EMS could not start:\n" + e.Message, AppName,
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // Salin exe ke %LOCALAPPDATA%\EMS dan buat shortcut. Mengembalikan path
    // tujuan kalau baru dipasang, null kalau sudah terpasang sebelumnya.
    static string Install()
    {
        string self = Assembly.GetExecutingAssembly().Location;
        string target = Path.Combine(Home, "EMS.exe");
        bool fresh = false;

        if (!string.Equals(Path.GetFullPath(self), Path.GetFullPath(target), StringComparison.OrdinalIgnoreCase))
        {
            // Menimpa versi lama kalau user mengunduh versi baru.
            File.Copy(self, target, true);
            fresh = true;
        }

        string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        string startMenu = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Programs), AppName + ".lnk");
        string desktopLink = Path.Combine(desktop, AppName + ".lnk");

        if (fresh || !File.Exists(desktopLink)) Shortcut(desktopLink, target);
        if (fresh || !File.Exists(startMenu)) Shortcut(startMenu, target);

        return fresh ? target : null;
    }

    static void Shortcut(string lnk, string target)
    {
        // WScript.Shell lewat late binding: tidak perlu referensi COM saat kompilasi.
        Type t = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(t);
        object sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
        Type st = sc.GetType();
        st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { target });
        st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { Home });
        st.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { target + ",0" });
        st.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { "Energy Monitoring System - PT Cisarua Mountain Dairy Tbk" });
        st.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
    }

    static string ReadUrl()
    {
        string f = Path.Combine(Home, "server.txt");
        if (File.Exists(f))
        {
            string u = File.ReadAllText(f).Trim();
            if (u.StartsWith("http://") || u.StartsWith("https://")) return u.EndsWith("/") ? u : u + "/";
        }
        return DefaultUrl;
    }

    static bool Reachable(string url)
    {
        try
        {
            Uri u = new Uri(url);
            using (TcpClient c = new TcpClient())
            {
                IAsyncResult ar = c.BeginConnect(u.Host, u.Port, null, null);
                bool ok = ar.AsyncWaitHandle.WaitOne(3000);
                if (ok) c.EndConnect(ar);
                return ok && c.Connected;
            }
        }
        catch { return false; }
    }

    // Edge dulu (terpasang di setiap Windows 10/11), lalu Chrome, lalu browser
    // bawaan sebagai jalan terakhir (tanpa mode aplikasi).
    static void Open(string url)
    {
        string profile = Path.Combine(Home, "profile");
        string appArgs = "--app=\"" + url + "?desktop=1\" --user-data-dir=\"" + profile + "\" --no-first-run --window-size=1440,900";

        string[] browsers = {
            Env("ProgramFiles(x86)") + @"\Microsoft\Edge\Application\msedge.exe",
            Env("ProgramFiles") + @"\Microsoft\Edge\Application\msedge.exe",
            Env("ProgramFiles") + @"\Google\Chrome\Application\chrome.exe",
            Env("ProgramFiles(x86)") + @"\Google\Chrome\Application\chrome.exe",
            Env("LOCALAPPDATA") + @"\Google\Chrome\Application\chrome.exe",
        };
        foreach (string b in browsers)
        {
            if (File.Exists(b)) { Process.Start(b, appArgs); return; }
        }
        Process.Start(url);
    }

    static string Env(string name) { return Environment.GetEnvironmentVariable(name) ?? ""; }
}
