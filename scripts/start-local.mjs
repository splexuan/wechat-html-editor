import { spawn } from 'node:child_process';

const port = 13580;
const url = `http://localhost:${port}/`;
const majorVersion = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);

if (majorVersion < 20) {
  console.error(`Node.js 20.19 or newer is required. Current version: ${process.version}`);
  process.exit(1);
}

console.log(`Starting WeChat HTML Editor at ${url}`);
console.log('Keep this window open while using the editor.');

const npmArguments = ['run', 'dev', '--', '--host', 'localhost', '--port', String(port), '--strictPort'];
const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
const commandArguments = process.platform === 'win32' ? ['/d', '/c', `npm.cmd ${npmArguments.join(' ')}`] : npmArguments;
const child = spawn(command, commandArguments, {
  cwd: process.cwd(),
  env: process.env,
  windowsHide: false,
});

let browserOpened = false;
let readyTimer = null;
let readinessTimer = null;

function openBrowser() {
  if (browserOpened) return;
  browserOpened = true;
  clearTimeout(readyTimer);
  if (process.platform === 'win32') {
    const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    browser.unref();
  } else {
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
  }
  console.log(`Editor ready: ${url}`);
}

async function waitUntilReady() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (response.ok) {
      clearInterval(readinessTimer);
      openBrowser();
    }
  } catch {
    // 服务仍在启动，继续轮询。
  }
}

function forwardOutput(stream, destination) {
  stream?.on('data', (chunk) => {
    const text = chunk.toString();
    destination.write(text);
    if (/Local:\s+http:\/\/localhost:13580\//i.test(text)) openBrowser();
  });
}

forwardOutput(child.stdout, process.stdout);
forwardOutput(child.stderr, process.stderr);
readinessTimer = setInterval(waitUntilReady, 500);
void waitUntilReady();

readyTimer = setTimeout(() => {
  console.error(`The editor did not become ready within 60 seconds: ${url}`);
  child.kill();
}, 60_000);

child.on('error', (error) => {
  clearTimeout(readyTimer);
  clearInterval(readinessTimer);
  console.error(`Failed to launch the local server: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  clearTimeout(readyTimer);
  clearInterval(readinessTimer);
  if (!browserOpened && code !== 0) {
    console.error(`The local server stopped with exit code ${code ?? 'unknown'}.`);
    process.exitCode = code || 1;
  }
});
