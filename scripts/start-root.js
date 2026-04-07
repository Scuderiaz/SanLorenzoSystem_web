const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const backendPort = Number(process.env.BACKEND_PORT || 3001);
const backendHealthUrl = process.env.BACKEND_HEALTH_URL || `http://localhost:${backendPort}/health`;
const backendScript = process.argv[2] === 'dev' ? 'dev' : 'start';

let shuttingDown = false;
const children = [];

function log(message) {
  process.stdout.write(`${message}\n`);
}

function prefixStream(stream, prefix, target) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      target.write(`[${prefix}] ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer) {
      target.write(`[${prefix}] ${buffer}\n`);
      buffer = '';
    }
  });
}

function spawnNpm(prefix, script, cwd) {
  const child = spawn('cmd.exe', ['/d', '/s', '/c', `npm run ${script}`], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
    shell: false,
  });

  prefixStream(child.stdout, prefix, process.stdout);
  prefixStream(child.stderr, prefix, process.stderr);
  children.push(child);
  return child;
}

function stopChildren(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  setTimeout(() => process.exit(exitCode), 250);
}

function waitForBackend(url, timeoutMs = 120000, intervalMs = 1000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
        } else if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Backend health check failed with status ${response.statusCode}`));
        } else {
          setTimeout(check, intervalMs);
        }
      });

      request.on('error', () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for backend at ${url}`));
        } else {
          setTimeout(check, intervalMs);
        }
      });
    };

    check();
  });
}

async function main() {
  const backend = spawnNpm('BACKEND', backendScript, path.join(rootDir, 'backend'));

  backend.on('exit', (code) => {
    if (!shuttingDown) {
      log(`[ROOT] Backend exited with code ${code ?? 0}. Stopping root launcher.`);
      stopChildren(code ?? 1);
    }
  });

  try {
    log(`[ROOT] Waiting for backend health at ${backendHealthUrl}...`);
    await waitForBackend(backendHealthUrl);
    log('[ROOT] Backend is ready. Starting frontend...');
  } catch (error) {
    log(`[ROOT] ${error.message}`);
    stopChildren(1);
    return;
  }

  const frontend = spawnNpm('FRONTEND', 'start', path.join(rootDir, 'web-app'));

  frontend.on('exit', (code) => {
    if (!shuttingDown) {
      log(`[ROOT] Frontend exited with code ${code ?? 0}. Stopping root launcher.`);
      stopChildren(code ?? 1);
    }
  });
}

process.on('SIGINT', () => stopChildren(0));
process.on('SIGTERM', () => stopChildren(0));

main().catch((error) => {
  log(`[ROOT] Failed to start app: ${error.message}`);
  stopChildren(1);
});
