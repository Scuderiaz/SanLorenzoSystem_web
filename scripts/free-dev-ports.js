const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function readPortFromEnv(filePath, fallbackPort) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/^PORT=(\d+)$/m);
    return match ? Number(match[1]) : fallbackPort;
  } catch {
    return fallbackPort;
  }
}

function parsePort(value, fallbackPort) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackPort;
}

function findPidsOnPort(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const pids = new Set();

    for (const line of output.split(/\r?\n/)) {
      if (!line.includes(`:${port}`) || !line.includes('LISTENING')) {
        continue;
      }

      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];

      if (/^\d+$/.test(pid) && pid !== '0') {
        pids.add(pid);
      }
    }

    return [...pids];
  } catch {
    return [];
  }
}

function killPid(pid, port) {
  try {
    execSync(`taskkill /PID ${pid} /F`, {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    console.log(`[ports] Freed port ${port} by stopping PID ${pid}`);
  } catch (error) {
    console.warn(`[ports] Could not stop PID ${pid} on port ${port}`);
  }
}

function freePort(port) {
  const pids = findPidsOnPort(port);

  if (pids.length === 0) {
    console.log(`[ports] Port ${port} is already free`);
    return;
  }

  for (const pid of pids) {
    killPid(pid, port);
  }
}

const rootDir = path.resolve(__dirname, '..');
const backendPort = readPortFromEnv(path.join(rootDir, 'backend', '.env'), 3001);
const frontendPort = parsePort(process.env.PORT, 3000);
const extraPorts = (process.env.ADDITIONAL_PORTS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => parsePort(value, NaN))
  .filter((value) => Number.isInteger(value) && value > 0);

const ports = [...new Set([frontendPort, backendPort, ...extraPorts])];

for (const port of ports) {
  freePort(port);
}
