// 验证 data-ignore-width 豁免链路是否真的进了产物。
// 注意：产物经 esbuild 压缩，标识符会被改写成单字母，不能按源码里的函数名/常量名匹配，
// 只能按"语义特征 + 属性字符串"来断言。
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const checks = [
  ['豁免常量含 data-ignore-width', /data-ignore-width/],
  ['豁免常量含 data-ignore-dm', /data-ignore-dm/],
  ['豁免常量含 data-no-dark', /data-no-dark/],
  // 豁免放行：属性剥离前先做一次 includes(...name) 判断并 continue，形态是 `<数组>.includes(<x>.name`
  ['豁免属性在剥离前被放行', /includes\([A-Za-z_$][\w$]*\.name/],
  // 容器转 section 时搬运属性：setAttribute(<x>.name, <x>.value)
  ['容器转 section 时搬运属性', /setAttribute\([A-Za-z_$][\w$]*\.name,\s*[A-Za-z_$][\w$]*\.value\)/],
  ['justify 提示不含"非标准值"误述', /不属于官方非标准值/],
  ['start/end 说明指向书写方向', /多语言书写方向/],
  ['静态固定宽度检查（375 安全线）', /超过一般手机可视宽度/],
  ['嵌套溢出检查', /超出外层固定宽度容器/],
  ['文本挤压检查', /不足以排下一个汉字/],
];

let failed = 0;
for (const [name, pattern] of checks) {
  const ok = pattern.test(html);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
}
console.log(failed ? `\n${failed} 项未通过` : '\n全部通过');
process.exit(failed ? 1 : 0);
