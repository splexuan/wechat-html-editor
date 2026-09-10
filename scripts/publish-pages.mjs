// 把构建产物发布到 gh-pages 分支（供 GitHub Pages 在线托管）。
//
// 为什么需要它：单文件产物是交付物。改完代码后除了提交到 main，
// 还要让在线版跟着更新，否则线上跑的还是旧版本。
//
// 做法：克隆远端 gh-pages 分支到临时目录 → 覆盖 index.html → 有变化才提交推送。
// 全程不碰当前工作区，也不切换分支。
//
// 用法：npm run publish:pages
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = path.join(ROOT, 'dist', 'index.html');
const BRANCH = 'gh-pages';
const PAGES_URL = 'https://splexuan.github.io/wechat-html-editor/';

const git = (args, options = {}) => execFileSync('git', args, { encoding: 'utf8', ...options });

// 沿用主仓库配置的专用 SSH key，避免用错身份或退回到默认 key。
const tryGit = (args, options = {}) => {
  try {
    return git(args, options).trim();
  } catch {
    return '';
  }
};

if (!existsSync(DIST)) {
  console.error('未找到 dist/index.html，请先运行 npm run build');
  process.exit(1);
}

const remote = tryGit(['remote', 'get-url', 'origin'], { cwd: ROOT });
if (!remote) {
  console.error('未找到 origin 远程仓库，请在项目仓库内运行。');
  process.exit(1);
}

const sshCommand = tryGit(['config', '--get', 'core.sshCommand'], { cwd: ROOT });
const workDir = mkdtempSync(path.join(tmpdir(), 'wechat-editor-pages-'));
const cloneDir = path.join(workDir, 'repo');

try {
  // ① 克隆现有 gh-pages；没有就新开一个（保留历史，避免反复 force push 堆积孤儿对象）
  const cloneArgs = ['clone', '--depth', '1', '--branch', BRANCH, '--single-branch'];
  if (sshCommand) cloneArgs.push('-c', `core.sshCommand=${sshCommand}`);
  cloneArgs.push(remote, cloneDir);

  try {
    execFileSync('git', cloneArgs, { stdio: 'pipe' });
  } catch {
    console.log(`远端还没有 ${BRANCH} 分支，改为新建。`);
    execFileSync('git', ['init', '-q', '-b', BRANCH, cloneDir]);
    execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: cloneDir });
  }
  if (sshCommand) execFileSync('git', ['config', 'core.sshCommand', sshCommand], { cwd: cloneDir });

  // ② 覆盖产物；.nojekyll 让 Pages 跳过 Jekyll 处理
  copyFileSync(DIST, path.join(cloneDir, 'index.html'));
  const nojekyll = path.join(cloneDir, '.nojekyll');
  if (!existsSync(nojekyll)) writeFileSync(nojekyll, '');
  execFileSync('git', ['add', '-A'], { cwd: cloneDir });

  // ③ 内容没变就不产生空提交
  const status = tryGit(['status', '--porcelain'], { cwd: cloneDir });
  if (!status) {
    console.log('在线版已是最新，无需发布。');
    console.log(`地址：${PAGES_URL}`);
    process.exit(0);
  }

  const size = (readFileSync(DIST).length / 1024).toFixed(0);
  execFileSync('git', ['commit', '-q', '-m', `publish: 更新单文件产物（${size} KB）`], { cwd: cloneDir, stdio: 'inherit' });
  execFileSync('git', ['push', 'origin', BRANCH], { cwd: cloneDir, stdio: 'inherit' });

  console.log(`\n✅ 已发布到 ${BRANCH} 分支（${size} KB）`);
  console.log(`在线地址：${PAGES_URL}`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
