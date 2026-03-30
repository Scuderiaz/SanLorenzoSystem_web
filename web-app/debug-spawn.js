const childProcess = require('child_process');

const originalSpawn = childProcess.spawn;
const originalFork = childProcess.fork;
const originalExecFile = childProcess.execFile;
const originalSpawnSync = childProcess.spawnSync;

childProcess.spawn = function patchedSpawn(command, args, options) {
  console.error(`[spawn-debug] command=${command} args=${JSON.stringify(args || [])}`);
  const child = originalSpawn.call(this, command, args, options);
  child.on('error', (error) => {
    console.error(`[spawn-debug-error] command=${command} message=${error.message}`);
  });
  return child;
};

childProcess.fork = function patchedFork(modulePath, args, options) {
  console.error(`[fork-debug] module=${modulePath} args=${JSON.stringify(args || [])}`);
  const child = originalFork.call(this, modulePath, args, options);
  child.on('error', (error) => {
    console.error(`[fork-debug-error] module=${modulePath} message=${error.message}`);
  });
  return child;
};

childProcess.execFile = function patchedExecFile(file, args, options, callback) {
  console.error(`[execFile-debug] file=${file} args=${JSON.stringify(args || [])}`);
  return originalExecFile.call(this, file, args, options, callback);
};

childProcess.spawnSync = function patchedSpawnSync(command, args, options) {
  console.error(`[spawnSync-debug] command=${command} args=${JSON.stringify(args || [])}`);
  return originalSpawnSync.call(this, command, args, options);
};
