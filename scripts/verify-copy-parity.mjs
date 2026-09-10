// 回归测试：「点复制按钮」与「全选复制」的产物一致性。
//
// 背景（真实用户反馈）：全选复制粘到公众号没问题，点复制按钮却样式出错。
//
// 根因：两条路径拿到的 HTML 来源不同 ——
//   · 全选复制：浏览器直接把作者 style="" 里的**原样声明**写进剪贴板，所见即所得。
//   · 点按钮  ：走 createWechatHtml → getComputedStyle，拿到的是**浏览器解析后的计算值**。
// 计算值会把大量"隐含推断"暴露出来，典型四类污染：
//   ① border-*-color 默认为 currentColor，会跟着 color 凭空造出 4 条边框色；
//   ② background:#faf7ef 被炸成 `none 0% 0% / auto repeat padding-box border-box rgb(...)`；
//   ③ line-height:1.8（倍数）被换算成固定 px（28.8px），不随字号缩放；
//   ④ 无单位 line-height 又被"叠字修正"误判成 1.8 < 16，强行改成 1.5。
//
// 本测试固化修复结果。需要 playwright + 本机 chromium（非项目依赖），
// 未安装时跳过而非失败，保证 CI/无浏览器环境可正常退出。
//
// 用法：node scripts/verify-copy-parity.mjs
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const DIST = new URL('../dist/index.html', import.meta.url);
if (!existsSync(DIST)) {
  console.error('未找到 dist/index.html，请先运行 npm run build');
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('未安装 playwright，跳过浏览器回归测试（不影响构建）。');
  console.log('如需运行：npm i -D playwright 并确保本机有 chromium。');
  process.exit(0);
}

// 本机常见 chromium 缓存；找不到就交给 playwright 自己解析。
function resolveChrome() {
  const candidates = [
    path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium-1208/chrome-win64/chrome.exe'),
    path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium-1208/chrome-linux/chrome'),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1208/chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

const FIXTURE = `<!doctype html>
<html><body>
  <div style="width:600px;margin:0 auto;background:#faf7ef;padding:16px;">
    <h1 style="color:#c8a45c;font-size:24px;text-align:center;">文章标题</h1>
    <p style="color:#333;font-size:16px;text-align:justify;line-height:1.8;">这是一段正文，用来验证复制路径下的样式保留情况。</p>
    <section style="background:linear-gradient(90deg,#faa,#afa);padding:10px;">渐变背景块</section>
    <div style="border-left:3px solid #c8a45c;background:#f5f0e6;padding:12px 16px;">引用块内容</div>
  </div>
</body></html>`;

const executablePath = resolveChrome();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(pathToFileURL(DIST.pathname.replace(/^\/([A-Za-z]:)/, '$1')).href, { waitUntil: 'load' });
await page.waitForTimeout(500);

await page.getByRole('tab', { name: /HTML 源码/ }).click();
const textarea = page.locator('#html-source');
await textarea.waitFor({ state: 'visible', timeout: 8000 });
await textarea.fill(FIXTURE);
await page.getByRole('button', { name: /更新预览/ }).click();
await page.waitForTimeout(600);
await page.getByRole('tab', { name: /预览编辑/ }).click();
await page.waitForTimeout(500);

await page.evaluate(() => {
  window.__copied = '';
  const stub = async (items) => {
    const item = items[0];
    window.__copied = item.types.includes('text/html') ? await (await item.getType('text/html')).text() : '';
  };
  Object.defineProperty(navigator, 'clipboard', { value: { write: stub, writeText: async () => {} }, configurable: true });
  document.execCommand = () => true;
});
await page.getByRole('button', { name: /复制到公众号|复制/ }).first().click();
await page.waitForTimeout(700);

const out = await page.evaluate(() => window.__copied || '');

const checks = [
  ['无凭空 border-color 注入（currentColor 闸门）', !/border-(top|right|bottom|left)-color/i.test(out)],
  ['background 简写未被展开成多段长串', !/background:\s*none 0% 0%/i.test(out)],
  ['background 保留纯色写法', /background:\s*(#faf7ef|rgb\(250,\s*247,\s*239\))/i.test(out)],
  ['line-height 未钉成固定 px（28.8px）', !/line-height:\s*28\.8px/i.test(out)],
  ['line-height 保持作者写的 1.8（未被误改为 1.5）', /line-height:\s*1\.8\b/i.test(out)],
  ['仍保留 data-ignore-width', /data-ignore-width/.test(out)],
  ['仍保留 data-ignore-dm=text-bg-gradient', /data-ignore-dm="[^"]*text-bg-gradient/.test(out)],
  ['仍保留 justify', /text-align:\s*justify/i.test(out)],
  ['居中容器 margin 仍为 auto', /margin:\s*0px auto/i.test(out) || /margin-left:\s*auto/i.test(out)],
  ['div 已转 section', !/<div[\s>]/i.test(out)],
  ['标题颜色保留', /color:\s*(#c8a45c|rgb\(200,\s*164,\s*92\))/i.test(out)],
];

console.log('=== 页面报错 ===');
console.log(errors.length ? errors.join('\n') : '（无）');
console.log('\n=== 按钮复制产物 ===');
console.log(out.slice(0, 1400));
console.log('\n=== 断言结果 ===');
let failed = 0;
for (const [name, pass] of checks) {
  if (!pass) failed += 1;
  console.log(`${pass ? '✓' : '✗'} ${name}`);
}
console.log(failed ? `\n${failed} 项未通过` : '\n全部通过');

await browser.close();
process.exit(failed ? 1 : 0);
