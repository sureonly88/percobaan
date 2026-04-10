'use strict';

/**
 * Pedami Print Bridge
 * -------------------
 * Local HTTP server yang menerima data struk dari browser (Next.js app)
 * dan mencetak ke printer Epson dot matrix via ESC/P.
 *
 * Endpoint:
 *   GET  /ping   → health check
 *   POST /print  → cetak struk (JSON body = ReceiptPrintData)
 *
 * Setup: lihat README.md
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { exec } = require('child_process');

const { formatEscp } = require('./formatter');

// ── Load config ──────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'config.json');
const config = {
  port:          6789,
  printerName:   'EPSON LX-310',   // → Windows Settings > Printers & Scanners: exact name
  printMode:     'ps',             // 'ps' (PowerShell WinSpooler) | 'copy' (copy /b to port)
  portMapping:   'LPT3:',          // Used only when printMode = 'copy'
  columns:       80,
  feedLines:     4,
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
    console.log('[Bridge] Config loaded from config.json');
  } catch (e) {
    console.error('[Bridge] Config parse error:', e.message, '— using defaults');
  }
}

// ── Raw print ─────────────────────────────────────────────────────────────────

/**
 * Mode: 'ps' — PowerShell + Win32 winspool API
 * Most reliable on Windows 10/11. Supports any USB printer by name.
 */
function printViaPowershell(escpData, printerName, cb) {
  const tmpFile = path.join(os.tmpdir(), `pedami_${Date.now()}.prn`);
  fs.writeFile(tmpFile, escpData, 'binary', (err) => {
    if (err) return cb(err);

    const safePath    = tmpFile.replace(/\\/g, '\\\\');
    const safePrinter = printerName.replace(/'/g, "''");

    // Inline C# via Add-Type to call Win32 winspool.drv directly
    const ps = `
$ErrorActionPreference = 'Stop'
$bytes = [System.IO.File]::ReadAllBytes('${safePath}')
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrint {
    [DllImport("winspool.drv",CharSet=CharSet.Ansi,SetLastError=true)]
    public static extern bool OpenPrinter(string n,ref IntPtr h,IntPtr d);
    [DllImport("winspool.drv",SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr h);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Ansi)]
    public struct DOC{public string Name;public string Out;public string Type;}
    [DllImport("winspool.drv",CharSet=CharSet.Ansi,SetLastError=true)]
    public static extern int StartDocPrinter(IntPtr h,int lv,[In,MarshalAs(UnmanagedType.LPStruct)] DOC di);
    [DllImport("winspool.drv",SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv",SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv",SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv",SetLastError=true)]
    public static extern bool WritePrinter(IntPtr h,IntPtr p,int n,ref int w);
}
'@
$h=[IntPtr]::Zero
[RawPrint]::OpenPrinter('${safePrinter}',[ref]$h,[IntPtr]::Zero)|Out-Null
$di=New-Object RawPrint+DOC; $di.Name='Receipt'; $di.Type='RAW'
[RawPrint]::StartDocPrinter($h,1,$di)|Out-Null
[RawPrint]::StartPagePrinter($h)|Out-Null
$gc=[System.Runtime.InteropServices.GCHandle]::Alloc($bytes,[System.Runtime.InteropServices.GCHandleType]::Pinned)
$ptr=$gc.AddrOfPinnedObject(); [int]$w=0
[RawPrint]::WritePrinter($h,$ptr,$bytes.Length,[ref]$w)|Out-Null
$gc.Free()
[RawPrint]::EndPagePrinter($h)|Out-Null
[RawPrint]::EndDocPrinter($h)|Out-Null
[RawPrint]::ClosePrinter($h)|Out-Null
`;
    exec(`powershell -NonInteractive -Command "${ps.replace(/"/g, '\\"')}"`,
      { shell: 'cmd.exe', timeout: 15000 },
      (err2, stdout, stderr) => {
        setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch {} }, 3000);
        if (err2) return cb(new Error(stderr || err2.message));
        cb(null);
      }
    );
  });
}

/**
 * Mode: 'copy' — Windows copy /b to a virtual port (e.g. LPT3:)
 * Requires one-time setup: net use LPT3: \\localhost\SHARE_NAME /persistent:yes
 */
function printViaCopy(escpData, portMapping, cb) {
  const tmpFile = path.join(os.tmpdir(), `pedami_${Date.now()}.prn`);
  fs.writeFile(tmpFile, escpData, 'binary', (err) => {
    if (err) return cb(err);
    exec(`copy /b "${tmpFile}" ${portMapping}`,
      { shell: 'cmd.exe', timeout: 10000 },
      (err2, stdout, stderr) => {
        setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch {} }, 3000);
        if (err2) return cb(new Error(stderr || err2.message));
        cb(null);
      }
    );
  });
}

function printRaw(escpData, cb) {
  if (config.printMode === 'copy') {
    printViaCopy(escpData, config.portMapping, cb);
  } else {
    printViaPowershell(escpData, config.printerName, cb);
  }
}

// ── HTTP Server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS — only allow localhost origins for security
  const origin = req.headers.origin || '';
  if (!origin || origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); return res.end();
  }

  // ── GET /ping ──
  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, printer: config.printerName, mode: config.printMode }));
  }

  // ── GET / ── (status page)
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!DOCTYPE html><html><head><title>Pedami Print Bridge</title></head>
<body style="font-family:monospace;background:#111;color:#0f0;padding:24px;">
<h2 style="color:#0f0">&#9679; Pedami Print Bridge — RUNNING</h2>
<table style="border-collapse:collapse;margin-top:16px;">
  <tr><td style="padding:4px 16px 4px 0">Port</td><td><b>${config.port}</b></td></tr>
  <tr><td style="padding:4px 16px 4px 0">Printer</td><td><b>${config.printerName}</b></td></tr>
  <tr><td style="padding:4px 16px 4px 0">Mode</td><td><b>${config.printMode}</b>${config.printMode === 'copy' ? ' (' + config.portMapping + ')' : ''}</td></tr>
  <tr><td style="padding:4px 16px 4px 0">Columns</td><td><b>${config.columns}</b></td></tr>
  <tr><td style="padding:4px 16px 4px 0">Feed Lines</td><td><b>${config.feedLines}</b></td></tr>
</table>
<p style="margin-top:16px;color:#888">POST /print — cetak struk (JSON body)</p>
</body></html>`);
  }

  // ── POST /print ──
  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(body); }
      catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }

      const escpData = formatEscp(data, { columns: config.columns, feedLines: config.feedLines });

      printRaw(escpData, (err) => {
        if (err) {
          console.error('[Bridge] Print error:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        const ts = new Date().toLocaleTimeString('id-ID');
        console.log(`[Bridge] ${ts} — Printed OK: ${data.loketCode || ''} ${data.kasir || ''} (${(data.bills || []).length} bill)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(config.port, '127.0.0.1', () => {
  console.log('='.repeat(60));
  console.log('  Pedami Print Bridge');
  console.log('='.repeat(60));
  console.log(`  URL     : http://127.0.0.1:${config.port}`);
  console.log(`  Printer : ${config.printerName}`);
  console.log(`  Mode    : ${config.printMode}${config.printMode === 'copy' ? ' → ' + config.portMapping : ''}`);
  console.log('='.repeat(60));
  console.log('  Buka http://localhost:' + config.port + ' untuk cek status.');
  console.log('  Tekan Ctrl+C untuk berhenti.\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERROR] Port ${config.port} sudah dipakai. Mungkin ada instance lain yang berjalan.`);
    console.error(`        Cari prosesnya: netstat -ano | findstr :${config.port}`);
    console.error(`        Hentikan: taskkill /PID <pid> /F`);
  } else {
    console.error('[ERROR]', err.message);
  }
  process.exit(1);
});
