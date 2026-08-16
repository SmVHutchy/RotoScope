#!/usr/bin/env node
// rotoc -- headless CLI fuer RotoScope Studio.
// Bewusst ohne Abhaengigkeiten: das hier muss laufen, bevor irgendetwas installiert ist.
// M0 kann: --version, doctor. compile/render folgen mit MOTIF in M3.

import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';

const ENGINE_URL = process.env.ROTOSCOPE_ENGINE ?? 'http://127.0.0.1:8787';

const pkg = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

const USAGE = `rotoc ${pkg.version}

  rotoc --version          Version ausgeben
  rotoc doctor             Umgebung pruefen (Node, Engine, Inferenz-Backends)

Noch nicht da (siehe PROJECT_PROMPT.md):
  rotoc compile <datei>    .motif -> MIR                        [M3]
  rotoc render <datei>     MIR headless rendern                 [M3]
  rotoc batch <ordner>     Stapelverarbeitung                   [M4]
`;

/** Engine abfragen, ohne bei Verbindungsfehlern zu werfen. */
async function ask(path, timeoutMs = 2000) {
  try {
    const res = await fetch(`${ENGINE_URL}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err.name === 'TimeoutError' ? 'Timeout' : err.message };
  }
}

async function doctor() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const lines = [];
  let problems = 0;

  lines.push(`node        ${process.versions.node}${nodeMajor >= 20 ? '' : '  << zu alt, >=20 noetig'}`);
  if (nodeMajor < 20) problems++;

  const health = await ask('/health');
  if (!health.ok) {
    lines.push(`engine      nicht erreichbar unter ${ENGINE_URL} (${health.error})`);
    lines.push(`            starten mit:  npm run engine`);
    problems++;
  } else {
    lines.push(`engine      ok, v${health.data.version} auf ${ENGINE_URL}`);

    // Grosszuegiger: laeuft die Engine kalt, kostet allein der torch-Import Sekunden.
    const device = await ask('/device', 20000);
    if (!device.ok) {
      lines.push(`device      /device antwortet nicht (${device.error})`);
      lines.push(`            Engine-Log pruefen — ein Backend-Probe ist abgestuerzt.`);
      problems++;
    } else {
      const { platform, backends, preferred } = device.data;
      lines.push(`python      ${platform.python} (${platform.system} ${platform.release})`);
      for (const b of backends) {
        lines.push(`  ${b.available ? '[ja]  ' : '[nein]'} ${b.name.padEnd(14)} ${b.detail}`);
        for (const d of b.devices ?? []) lines.push(`         device: ${d}`);
      }
      if (preferred) {
        lines.push(`backend     bevorzugt: ${preferred}`);
      } else {
        lines.push(`backend     KEIN GPU-Backend verfuegbar.`);
        lines.push(`            Das ist in M0 erwartet. Spike: scripts/spike/README.md`);
        problems++;
      }
    }
  }

  console.log(lines.join('\n'));
  return problems;
}

const { values, positionals } = parseArgs({
  options: { version: { type: 'boolean', short: 'v' }, help: { type: 'boolean', short: 'h' } },
  allowPositionals: true,
});

if (values.version) {
  console.log(pkg.version);
} else if (values.help || positionals.length === 0) {
  console.log(USAGE);
} else if (positionals[0] === 'doctor') {
  process.exitCode = (await doctor()) > 0 ? 1 : 0;
} else {
  console.error(`Unbekannter Befehl: ${positionals[0]}\n`);
  console.error(USAGE);
  process.exitCode = 2;
}
