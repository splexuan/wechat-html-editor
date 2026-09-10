// 产物结构断言：确认改造后的关键行为都进了 dist 产物。
// 注意：产物经 esbuild 压缩，标识符变单字母，只能按"语义特征 + 字面量"匹配，不能按源码函数名。
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const checks = [
  // 豁免属性体系
  ['豁免常量含 data-ignore-width', /data-ignore-width/],
  ['豁免常量含 data-ignore-dm', /data-ignore-dm/],
  ['豁免常量含 data-no-dark', /data-no-dark/],
  ['支持 low-contrast 规则', /low-contrast/],
  ['支持 text-bg-gradient 规则', /text-bg-gradient/],
  ['豁免属性在剥离前被放行', /includes\([A-Za-z_$][\w$]*\.name/],
  ['容器转 section 时搬运属性', /setAttribute\([A-Za-z_$][\w$]*\.name,\s*[A-Za-z_$][\w$]*\.value\)/],

  // 路线转变：保留而非改写
  ['固定宽度改为豁免标记', /固定宽度豁免/],
  ['不再出现"响应式容器"改写', /响应式容器/.test(html) === false],
  ['渐变深色豁免逻辑', /渐变深色豁免/],
  ['低对比度豁免逻辑', /低对比度豁免/],
  ['box-sizing 补齐', /box-sizing:\s*border-box/],

  // text-align 策略修正
  ['start/end 仍转换为 left/right', /不同终端兼容性有差异/],
  ['justify 不再报错提示', /两端对齐不属于官方非标准值/.test(html) === false],

  // 保留的官方依据清理
  ['保留 font-family 移除（规范第 3 章）', /不建议自定义字体/],
  ['保留 !important 移除（规范 4.5.2）', /深色模式算法失效/],

  // 不作恶：不引入 135 的自造属性
  ['未引入 data-darkmode-* 自造属性', /data-darkmode/.test(html) === false],
  ['未引入 class="darkmode" 样式表', /class="darkmode"/.test(html) === false],
];

let failed = 0;
for (const [name, pattern] of checks) {
  const ok = pattern instanceof RegExp ? pattern.test(html) : Boolean(pattern);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
}
console.log(failed ? `\n${failed} 项未通过` : '\n全部通过');
process.exit(failed ? 1 : 0);
