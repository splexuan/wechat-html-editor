// 构建后处理：vite-plugin-singlefile 已把 JS/CSS 内联进 dist/index.html。
// 这里把它重命名成便于识别和分发的文件名，双击即可使用。
// 用「重命名」而不是「复制」，避免 dist 里留下两份内容完全相同的产物。
import { rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'dist', 'index.html');
const target = path.join(root, 'dist', '公众号排版助手.html');

const { size } = await stat(source);
await rename(source, target);

console.log(`\n单文件产物已生成：dist/公众号排版助手.html（${(size / 1024).toFixed(1)} KB）`);
console.log('可直接双击打开，或单独发给他人使用，无需 Node.js 和网络。\n');
