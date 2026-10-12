#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Screenshot-Werkzeug für reproduzierbare Vorher/Nachher-Aufnahmen.
//
// Treibt einen bereits auf der Platte liegenden Chromium über das
// DevTools-Protokoll (keine npm-Abhängigkeit) und ruft damit die festen
// Kameraposen aus src/dev/photo.ts im Spiel ab.
//
//   node tools/capture.mjs --out art/baseline
//   node tools/capture.mjs --url "http://127.0.0.1:5173/?photo=1&seed=1" \
//                          --out art/nachher --poses klippen,boot_aussen
//
// Voraussetzung: `npm run dev` läuft (Standard http://127.0.0.1:5173).
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    join(homedir(), '.cache/puppeteer/chrome/linux-152.0.7977.54/chrome-linux64/chrome'),
    join(homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'),
  ];
  for (const c of candidates) if (c && existsSync(c)) return c;
  throw new Error('Kein Chromium gefunden (CHROME_PATH setzen)');
}

const OUT = arg('out', 'art/aufnahmen');
const URL = arg('url', 'http://127.0.0.1:5173/?photo=1&seed=1');
const PORT = Number(arg('port', 9222));
const WIDTH = Number(arg('width', 960));
const HEIGHT = Number(arg('height', 540));
const POSEN_ARG = arg('poses', '');
const LABEL = arg('label', '');
const HUD = process.argv.includes('--hud');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools(port, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      /* noch nicht bereit */
    }
    await sleep(150);
  }
  throw new Error('DevTools-Port antwortet nicht');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        const list = this.events.get(msg.method) ?? [];
        for (const fn of list) fn(msg.params);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) {
    const list = this.events.get(method) ?? [];
    list.push(fn);
    this.events.set(method, list);
  }
  once(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${method} Timeout`)), timeoutMs);
      this.on(method, (p) => {
        clearTimeout(t);
        resolve(p);
      });
    });
  }
}

async function connect(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('Kein Page-Target gefunden');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  return new Cdp(ws);
}

async function main() {
  const chrome = findChrome();
  const profile = join(process.env.TMPDIR || '/tmp', `ditd-chrome-${PORT}`);
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${WIDTH},${HEIGHT}`,
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${PORT}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    await waitForDevtools(PORT);
    const cdp = await connect(PORT);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: URL });
    await loaded;

    // Auf das Foto-Werkzeug warten
    for (let i = 0; i < 60; i++) {
      const { result } = await cdp.send('Runtime.evaluate', {
        expression: '!!globalThis.__ditd',
        returnByValue: true,
      });
      if (result.value) break;
      await sleep(200);
    }
    const { result: poseRes } = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify(globalThis.__ditd ? globalThis.__ditd.posen : null)',
      returnByValue: true,
    });
    const allePosen = JSON.parse(poseRes.value ?? 'null');
    if (!allePosen) throw new Error('Foto-Werkzeug nicht aktiv (läuft der Dev-Server?)');

    const gewuenscht = POSEN_ARG
      ? POSEN_ARG.split(',').map((s) => s.trim()).filter(Boolean)
      : allePosen;
    const posen = gewuenscht.filter((p) => allePosen.includes(p));

    await mkdir(OUT, { recursive: true });
    const prefix = LABEL ? `${LABEL}-` : '';
    if (HUD) await cdp.send('Runtime.evaluate', { expression: 'globalThis.__ditd.hud(true)' });
    console.log(`Aufnahmen: ${posen.length} → ${OUT}`);

    for (const pose of posen) {
      await cdp.send('Runtime.evaluate', {
        expression: `globalThis.__ditd.pose(${JSON.stringify(pose)})`,
        awaitPromise: true,
      });
      // Zwei Frames + kurze Pause: das Spiel zeichnet kontinuierlich
      await cdp.send('Runtime.evaluate', {
        expression:
          'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
        awaitPromise: true,
      });
      await sleep(180);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const file = join(OUT, `${prefix}${pose}.png`);
      await writeFile(file, Buffer.from(shot.data, 'base64'));
      console.log(`  ✓ ${file}`);
    }

    await cdp.send('Browser.close').catch(() => {});
  } finally {
    child.kill('SIGKILL');
  }
}

main().catch((e) => {
  console.error('Abbruch:', e.message);
  process.exit(1);
});
