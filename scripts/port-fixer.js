const { execSync } = require('child_process');

function killPort(port) {
  try {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      const output = execSync(`netstat -ano | findstr :${port}`).toString();
      const lines = output.split('\n');
      const pids = new Set();
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 4 && parts[1].endsWith(`:${port}`)) {
          pids.add(parts[parts.length - 1]);
        }
      });

      pids.forEach(pid => {
        if (pid && pid !== '0') {
          console.log(`[Port Fixer] Killing process ${pid} on port ${port}...`);
          try {
            execSync(`taskkill /F /PID ${pid}`);
          } catch (e) {
            // Might already be dead
          }
        }
      });
    } else {
      execSync(`lsof -t -i:${port} | xargs kill -9`);
    }
  } catch (err) {
    // Port likely already free
  }
}

console.log('[Port Fixer] Checking port 5000...');
killPort(5000);
console.log('[Port Fixer] Cleanup complete.');
