import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const STORAGE_KEY = 'wechat-html-editor-document-v1';

// localStorage 在 file:// 协议（双击打开的单文件版本）或隐私模式下，可能被浏览器
// 禁用并直接抛异常。这里做一层安全兜底，保证存储不可用时应用照常运行，
// 只是不再自动保存草稿，而不是整页白屏。
const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // 静默降级：编辑、预览、复制功能不受影响。
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // 同上。
    }
  },
};

const STARTER_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>示例文章</title>
  <style>
    body { margin: 0; color: #27272a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; font-size: 16px; line-height: 1.8; }
    .article { max-width: 677px; margin: 0 auto; padding: 28px 22px 48px; box-sizing: border-box; }
    .eyebrow { color: #9a7626; font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-align: center; }
    h1 { margin: 12px 0 18px; color: #18181b; font-size: 30px; line-height: 1.35; text-align: center; }
    .lead { margin: 0 0 28px; color: #52525b; font-size: 17px; text-align: center; }
    .rule { width: 42px; height: 3px; margin: 0 auto 30px; background: #c9a544; border-radius: 999px; }
    h2 { margin: 30px 0 12px; color: #18181b; font-size: 21px; line-height: 1.5; }
    p { margin: 0 0 16px; }
    .quote { margin: 24px 0; padding: 18px 20px; border-left: 4px solid #c9a544; background: #faf8f2; color: #3f3f46; }
  </style>
</head>
<body>
  <main class="article">
    <div class="eyebrow">本地排版 · 无需登录</div>
    <h1 style="margin:12px 0 18px;color:#18181b;font-size:30px;line-height:1.35;text-align:center;">把 AI 生成的 HTML</h1>
    <h1 style="margin:0 0 18px;color:#18181b;font-size:30px;line-height:1.35;text-align:center;">直接变成公众号图文</h1>
    <p class="lead">导入、微调、复制，文章只保存在你的电脑里。</p>
    <div class="rule"></div>
    <h2>这是一个可编辑的示例</h2>
    <p>点击这里就可以修改文字。你也可以导入 AI 生成的完整 HTML 文件，工具会保留排版，并在复制时把关键样式转成公众号更容易识别的行内样式。</p>
    <div class="quote">完成后，点击右上角的“复制到公众号”，再到公众号后台粘贴即可。</div>
    <p>建议图片使用公开可访问的 HTTPS 地址，本地磁盘路径无法随文章一起进入公众号。</p>
  </main>
</body>
</html>`;

const STYLE_PROPERTIES = [
  'align-content', 'align-items', 'align-self', 'aspect-ratio', 'background-clip', 'background-color',
  'background-image', 'background-origin', 'background-position', 'background-repeat', 'background-size',
  'border-collapse', 'border-spacing', 'border-bottom-color', 'border-bottom-style', 'border-bottom-width',
  'border-left-color', 'border-left-style', 'border-left-width', 'border-radius', 'border-right-color', 'border-right-style',
  'border-right-width', 'border-top-color', 'border-top-style', 'border-top-width', 'bottom', 'box-shadow',
  'box-sizing', 'clip-path', 'color', 'column-gap', 'columns', 'display', 'filter', 'float', 'flex',
  'flex-basis', 'flex-direction', 'flex-grow', 'flex-shrink', 'flex-wrap', 'font-family', 'font-size',
  'font-style', 'font-weight', 'gap', 'grid-auto-columns', 'grid-auto-flow', 'grid-auto-rows',
  'grid-column', 'grid-row', 'grid-template-columns', 'grid-template-rows', 'height', 'inset',
  'justify-content', 'justify-items', 'justify-self', 'left', 'letter-spacing', 'list-style-image',
  'list-style-position', 'list-style-type',
  'line-height', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'max-height', 'max-width',
  'min-height', 'min-width', 'object-fit', 'object-position', 'opacity', 'order', 'overflow', 'overflow-wrap',
  'overflow-x', 'overflow-y', 'padding-bottom', 'padding-left', 'padding-right', 'padding-top', 'position',
  'right', 'row-gap', 'table-layout', 'text-align', 'text-decoration', 'text-indent', 'text-overflow',
  'text-shadow', 'text-transform', 'top', 'transform', 'transform-origin', 'vertical-align', 'visibility',
  'white-space', 'width', 'word-break', 'word-wrap', 'writing-mode', 'z-index',
] as const;

const INHERITED_PROPERTIES = new Set([
  'color', 'font-family', 'font-size', 'font-style', 'font-weight', 'letter-spacing', 'line-height',
  'text-align', 'text-decoration', 'text-indent', 'white-space', 'word-break',
]);

// 这些属性只有作者明确写过（内联 style 或匹配到 stylesheet 规则）才写入；
// 否则 getComputedStyle 会把所有“默认值”倒进产物，污染剪贴板 HTML。
const EXPLICIT_ONLY_PROPERTIES = new Set([
  'align-content', 'align-items', 'align-self', 'aspect-ratio', 'background-clip', 'background-origin',
  'background-position', 'background-repeat', 'background-size', 'border-collapse', 'border-spacing',
  'bottom', 'box-shadow', 'clip-path', 'column-gap', 'columns', 'display', 'filter', 'float', 'flex',
  'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-wrap', 'gap',
  'grid-auto-columns', 'grid-auto-flow', 'grid-auto-rows', 'grid-column', 'grid-row',
  'grid-template-columns', 'grid-template-rows', 'height', 'inset', 'justify-content', 'justify-items',
  'justify-self', 'left', 'list-style-position', 'list-style-type', 'margin-bottom', 'margin-left',
  'margin-right', 'margin-top', 'max-height', 'max-width', 'min-height',
  'min-width', 'object-fit', 'object-position', 'opacity', 'order', 'overflow', 'overflow-wrap', 'overflow-x',
  'overflow-y', 'position', 'right', 'row-gap', 'table-layout', 'text-align', 'text-overflow', 'top',
  'transform', 'transform-origin', 'vertical-align', 'visibility', 'white-space', 'width', 'word-break',
  'writing-mode', 'z-index',
]);

// 这些属性的“合法值”写法繁多（font-weight 的 400 / normal / bold 都映射到同一默认值），
// 复制时通过与 docElem 的计算值对比来兜底过滤掉浏览器默认值，避免污染产物。
const GEOMETRY_PROPERTY_DEFAULTS: Record<string, string[]> = {
  'transform-origin': ['50% 50%', 'center', '50% 50% 0px', 'center center', '0px 0px'],
  'background-position': ['0% 0%', '0px 0px', 'left top', 'top left', '0 0'],
  'background-size': ['auto auto', 'auto'],
  'border-spacing': ['0px 0px', '0px'],
  'flex': ['0 1 auto', '0 1 auto 0%'],
  'flex-flow': ['row nowrap', 'row'],
  'grid-auto-flow': ['row', 'column', 'row dense', 'column dense'],
};

const EMPTY_VALUES = new Set(['', '0px', 'auto', 'none', 'normal', 'rgba(0, 0, 0, 0)', 'transparent', 'visible']);

type Notice = { kind: 'success' | 'warning' | 'error'; title: string; detail: string };

type ValidationIssue = {
  level: 'error' | 'warning';
  rule: string;
  message: string;
};

type IconName = 'align-center' | 'align-left' | 'align-right' | 'bold' | 'check' | 'clipboard' | 'code' | 'download' | 'file' | 'italic' | 'laptop' | 'redo' | 'reset' | 'shield' | 'trash' | 'undo' | 'upload';

// 公众号官方"豁免"属性（规范 1.4.4 / 4.5.1 / 4.6）：作者显式标记后，后台校验与转换算法会放行。
// 我们这套工具作为"复制前的预检 + 清洗"，必须与官方保持同一语义，否则会出现"我们报了错、但粘过去其实没问题"的割裂感。
// 命中豁免的元素：校验层不报问题；清洗层不动它的相关样式；属性本身必须原样进剪贴板（正是它让后台放行）。
//
// ⚠️ 三者生效范围不同，这是实现上最容易出错的地方：
//   data-ignore-width —— 节点 + 全部后代（子树级），官方用 closest 向上查找
//   data-ignore-dm    —— 仅当前节点（后代仍会被检测）
//   data-no-dark      —— 仅当前节点（后代含内联样式仍会转换）
const WECHAT_EXEMPT_ATTRIBUTES = ['data-ignore-width', 'data-ignore-dm', 'data-no-dark'] as const;

// `data-ignore-dm` 的官方取值（可多选，空格分隔）
const IGNORE_DM_LOW_CONTRAST = 'low-contrast';       // 跳过「文字与背景对比度过低」
const IGNORE_DM_TEXT_BG_GRADIENT = 'text-bg-gradient'; // 跳过「文字背景使用了渐变」

/** 子树级豁免：官方语义是「该节点及其所有后代」都跳过 width 类检测。 */
function isWidthExempt(element: Element) {
  return element.closest('[data-ignore-width]') !== null;
}

/** 节点级豁免：读取该元素自身声明的 data-ignore-dm 规则集合。 */
function getIgnoreDmRules(element: Element) {
  const raw = (element.getAttribute('data-ignore-dm') || '').toLowerCase();
  return new Set(raw.split(/\s+/).filter(Boolean));
}

/** 节点级豁免：data-no-dark 仅作用于自身。 */
function isNoDark(element: Element) {
  return element.hasAttribute('data-no-dark');
}

/**
 * 把规则追加到元素的 data-ignore-dm 上（官方语义：多个规则空格分隔）。
 * 已存在同类规则时不重复添加，也不会覆盖作者手写的其他规则。
 */
function appendIgnoreDm(element: HTMLElement, rule: string) {
  const rules = getIgnoreDmRules(element);
  if (rules.has(rule)) return false;
  rules.add(rule);
  element.setAttribute('data-ignore-dm', Array.from(rules).join(' '));
  return true;
}

// —— 颜色与对比度工具（用于自动判定是否需要 low-contrast 豁免）——
// 官方 Dark Mode 算法只处理内联样式，因此这里也只看内联值，不依赖渲染测量。

/** 解析 rgb()/rgba()/十六进制颜色为 [r, g, b, a]，无法解析时返回 null。 */
function parseColor(input: string): [number, number, number, number] | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  if (value === 'transparent') return [0, 0, 0, 0];

  const rgbMatch = value.match(/^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/);
  if (rgbMatch) {
    const alpha = rgbMatch[4] === undefined
      ? 1
      : (rgbMatch[4].endsWith('%') ? Number.parseFloat(rgbMatch[4]) / 100 : Number.parseFloat(rgbMatch[4]));
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]), Number.isFinite(alpha) ? alpha : 1];
  }

  const hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length === 6 || h.length === 8) {
      return [
        Number.parseInt(h.slice(0, 2), 16),
        Number.parseInt(h.slice(2, 4), 16),
        Number.parseInt(h.slice(4, 6), 16),
        h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1,
      ];
    }
  }
  return null;
}

/** 相对亮度（WCAG 2.x）。 */
function relativeLuminance([r, g, b]: [number, number, number, number]) {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 对比度（1 ~ 21）。任一颜色无法解析时返回 null。 */
function contrastRatio(foreground: string, background: string) {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return null;
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * 沿祖先链找出第一个"有实色背景"的颜色，作为对比度计算的底色。
 * 只看内联 background-color / background，与官方算法保持一致（它同样不解析外部样式表）。
 * 渐变背景无法给出确定底色，遇到时返回 null 交由渐变的豁免分支处理。
 */
function resolveBackdropColor(element: Element): string | null {
  let current: Element | null = element;
  while (current) {
    const style = (current as HTMLElement).style;
    if (style) {
      if (/gradient\(/i.test(style.backgroundImage || '')) return null;
      const color = style.backgroundColor || '';
      const parsed = color ? parseColor(color) : null;
      if (parsed && parsed[3] > 0) return color;
      // background 简写里也可能带颜色，浏览器通常已物化到 backgroundColor，这里兜一层
      const shorthand = style.getPropertyValue('background');
      if (shorthand && /^[#a-z]|rgb/i.test(shorthand.trim())) {
        const shorthandColor = parseColor(shorthand.trim());
        if (shorthandColor && shorthandColor[3] > 0) return shorthand.trim();
      }
    }
    current = current.parentElement;
  }
  return null;
}

/** 判断元素是否带渐变背景（background 或 background-image 含 linear/radial-gradient）。 */
function hasGradientBackground(element: HTMLElement) {
  const style = element.style;
  return /gradient\(/i.test(`${style.backgroundImage || ''} ${style.getPropertyValue('background') || ''}`);
}

const ICON_PATHS: Record<IconName, string> = {
  'align-center': 'M4 6h16M7 10h10M4 14h16M7 18h10',
  'align-left': 'M4 6h16M4 10h11M4 14h16M4 18h11',
  'align-right': 'M4 6h16M9 10h11M4 14h16M9 18h11',
  bold: 'M7 5h6a4 4 0 0 1 0 8H7V5Zm0 8h7a4 4 0 0 1 0 8H7v-8Z',
  check: 'm5 12 4 4L19 6',
  clipboard: 'M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3M9 3h6v4H9V3Z',
  code: 'm8 9-3 3 3 3m8-6 3 3-3 3m-3-8-2 10',
  download: 'M12 3v12m-5-5 5 5 5-5M5 21h14',
  file: 'M6 2h8l4 4v16H6V2Zm8 0v5h5M9 12h6m-6 4h6',
  italic: 'M10 5h8M6 19h8m1-14L9 19',
  laptop: 'M4 5h16v11H4V5Zm-2 14h20',
  redo: 'M20 7v5h-5m5 0a8 8 0 1 0-2 5',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8m0 0h5M3 8V3',
  shield: 'M12 3 20 6v6c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6l8-3Zm-3 9 2 2 4-5',
  trash: 'M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v6m4-6v6',
  undo: 'M4 7v5h5M4 12a8 8 0 1 1 2 5',
  upload: 'M12 21V9m-5 5 5-5 5 5M5 3h14',
};

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

function cleanPreviewDocument(input: string) {
  const doc = new DOMParser().parseFromString(input, 'text/html');
  doc.querySelectorAll('script, iframe, object, embed, form, input, textarea, select, button, meta[http-equiv="refresh"]').forEach((node) => node.remove());
  doc.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
      if ((attribute.name === 'href' || attribute.name === 'src') && /^\s*javascript:/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  doc.documentElement.lang = 'zh-CN';
  if (!doc.querySelector('meta[charset]')) {
    const meta = doc.createElement('meta');
    meta.setAttribute('charset', 'UTF-8');
    doc.head.prepend(meta);
  }
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function getDocumentTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const value = title || heading || '';
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '未命名文章';
}

function serialiseEditableDocument(doc: Document) {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelector('body')?.removeAttribute('contenteditable');
  clone.querySelector('body')?.removeAttribute('spellcheck');
  return `<!doctype html>\n${clone.outerHTML}`;
}

function hasStylesheetProperty(element: Element, property: string) {
  const inspectRules = (rules: CSSRuleList): boolean => {
    for (const rule of Array.from(rules)) {
      if ('selectorText' in rule && 'style' in rule) {
        try {
          const styleRule = rule as CSSStyleRule;
          if (styleRule.style.getPropertyValue(property) && element.matches(styleRule.selectorText)) return true;
        } catch {
          // 忽略浏览器不支持或无效的选择器。
        }
      } else if ('cssRules' in rule) {
        try {
          if (inspectRules((rule as CSSGroupingRule).cssRules)) return true;
        } catch {
          // 跨域样式表或受限规则无法读取时跳过。
        }
      }
    }
    return false;
  };


  for (const sheet of Array.from(element.ownerDocument.styleSheets)) {
    try {
      if (inspectRules(sheet.cssRules)) return true;
    } catch {
      // 跨域样式表无法读取时跳过。
    }
  }
  return false;
}

function createMaterialisedPseudo(doc: Document, source: Element, side: '::before' | '::after') {
  const computed = doc.defaultView?.getComputedStyle(source, side);
  if (!computed || computed.display === 'none') return null;
  const content = computed.content;
  const hasBox = computed.backgroundImage !== 'none' || computed.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
    [computed.borderTopWidth, computed.borderRightWidth, computed.borderBottomWidth, computed.borderLeftWidth].some((value) => getNumericPixels(value) > 0);
  if ((!content || content === 'none' || content === 'normal') && !hasBox) return null;

  const pseudo = document.createElement('span');
  pseudo.setAttribute('data-materialised-pseudo', side.slice(2));
  pseudo.setAttribute('aria-hidden', 'true');
  if (/^(["']).*\1$/.test(content)) pseudo.textContent = content.slice(1, -1).replace(/\\(["'\\])/g, '$1');
  STYLE_PROPERTIES.forEach((property) => {
    const value = computed.getPropertyValue(property).trim();
    if (!EMPTY_VALUES.has(value)) pseudo.style.setProperty(property, value);
  });
  return pseudo;
}

function hasVisibleText(element: Element) {
  return Boolean(element.textContent?.replace(/\s+/g, '').trim());
}

function isFixedPixelValue(value: string) {
  return /^\d+(?:\.\d+)?px$/i.test(value.trim());
}

function getNumericPixels(value: string) {
  const result = Number.parseFloat(value);
  return Number.isFinite(result) ? result : 0;
}

function normaliseTextAlign(value: string) {
  const align = value.trim().toLowerCase();
  if (!align) return '';
  if (['left', 'right', 'center'].includes(align)) return align;
  // 官方规范 1.6 只把 start / end 列为错误值：不同终端兼容性差异会导致部分设备居中、部分居左。
  // 这两个转换成等价的标准值，语义不变。
  if (/^(start|-webkit-left|-moz-left)$/.test(align)) return 'left';
  if (/^(end|-webkit-right|-moz-right)$/.test(align)) return 'right';
  if (/^(-webkit-center|-moz-center)$/.test(align)) return 'center';
  // justify / inter-word / distribute 等：官方规范**没有**把它们列为错误值。
  // 早期版本会在这里返回空字符串（即删除），属于过度处理 —— 作者写了两端对齐就被我们改掉了，
  // 这正是"本地预览与公众号不一致"的来源之一。现在改为原样保留，交给公众号按自己的规则渲染。
  return align;
}

function redundantNestingDepth(element: Element) {
  let depth = 1;
  let current = element;
  while (current.parentElement && current.parentElement.tagName === current.tagName && current.parentElement.children.length === 1 && current.parentElement.getAttribute('style') === current.getAttribute('style')) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

// —— 布局静态推算（不依赖真实渲染测量）——
// 我们这套工具是零依赖单文件，引不了 puppeteer 那套真实渲染引擎，所以只能靠"声明值"做静态推算。
// 但静态推算有个关键盲点：直接在宽度受限的父容器里写一个更大的固定宽度，父元素自身宽度是合法的，
// getBoundingClientRect 只量到"被父级裁剪后"的尺寸，于是溢出被漏报。
// 这里沿祖先链累加 padding/border 与固定宽度，推出"这个子树理论上需要多宽"，用于补齐盲点。
function getDeclaredExtraWidth(element: HTMLElement) {
  // 元素自身盒子在 width 之外额外占用的水平空间：左右 padding + 左右 border。
  const pad = (side: 'paddingLeft' | 'paddingRight') => getNumericPixels(element.style.getPropertyValue(side === 'paddingLeft' ? 'padding-left' : 'padding-right'));
  const border = (side: 'borderLeft' | 'borderRight') => {
    const value = element.style.getPropertyValue(side === 'borderLeft' ? 'border-left-width' : 'border-right-width');
    if (value) return getNumericPixels(value);
    // 只给了 border 简写或 border-*-style 时，宽度缺省为 medium(3px)；border:0/none 时为 0。
    const shorthand = element.style.getPropertyValue('border');
    if (/^\s*(0|none)\b/i.test(shorthand) || /none/i.test(element.style.getPropertyValue(side === 'borderLeft' ? 'border-left-style' : 'border-right-style'))) return 0;
    return element.style.getPropertyValue(side === 'borderLeft' ? 'border-left' : 'border-right') ? 3 : 0;
  };
  return pad('paddingLeft') + pad('paddingRight') + border('borderLeft') + border('borderRight');
}

// 从元素自身向上逐层累加：固定像素宽度取原值，其余按 0 计（无宽度约束的祖先不贡献需求）。
// 文本换行空间推算：容器固定宽度扣掉水平内边距与边框后，是否小到排不下一个汉字。
function hasCrampedTextWidth(element: HTMLElement) {
  const width = getNumericPixels(element.style.width);
  if (!width) return false;
  const inner = width - getDeclaredExtraWidth(element);
  return inner > 0 && inner < 12;
}

// 判断元素是否处在"固定宽度比自己窄"的祖先容器中 —— 这种必然溢出，但 getBoundingClientRect 量不出来。
function findClampingAncestor(element: HTMLElement) {
  const own = getNumericPixels(element.style.width);
  if (!own) return null;
  let parent = element.parentElement;
  while (parent && parent !== element.ownerDocument.body) {
    const parentWidth = getNumericPixels(parent.style.width);
    if (parentWidth > 0) {
      const available = parentWidth - getDeclaredExtraWidth(parent);
      // 留 1px 容差，避免边框/取整造成的假阳性。
      if (own > available + 1) return { parent, available };
      return null; // 最近一个固定宽度祖先就够宽，无需再往上找
    }
    parent = parent.parentElement;
  }
  return null;
}

function validateWechatDocument(doc: Document): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (level: ValidationIssue['level'], rule: string, message: string) => {
    if (!issues.some((item) => item.rule === rule && item.message === message)) issues.push({ level, rule, message });
  };

  doc.body.querySelectorAll<HTMLElement>('*').forEach((element) => {
    const style = element.style;
    const computed = doc.defaultView?.getComputedStyle(element);
    const tag = element.tagName.toLowerCase();

    if (style.getPropertyValue('font-family')) add('warning', '字体', '检测到自定义 font-family，复制时会移除并使用公众号官方默认字体栈（规范第 3 章：不建议自定义字体）。');
    if (style.getPropertyPriority('color') === 'important' || style.cssText.includes('!important')) add('warning', '!important', '检测到 !important，复制时会移除优先级（规范 4.5.2：会让平台公共样式与深色模式算法失效）。');
    // 官方规范 1.6 只把 start / end 判为错误值，复制时转成等价的 left / right。
    if (/^(start|end)$/i.test(style.textAlign)) add('warning', 'text-align', 'start/end 在不同终端兼容性有差异（部分设备居中、部分居左）；复制时会转为 left/right，视觉等价。');
    if (/rgba?\([^)]*,\s*0\s*\)|transparent/i.test(style.caretColor)) add('warning', 'caret-color', '透明输入光标会影响编辑，复制时会移除。');
    if (tag === 'img' && getNumericPixels(computed?.opacity || style.opacity || '1') === 0) add('error', 'opacity', '发现 opacity:0 的图片，公众号后台可能无法选中或替换。');

    if (computed && hasVisibleText(element)) {
      const fontSize = getNumericPixels(computed.fontSize);
      const lineHeight = getNumericPixels(computed.lineHeight);
      if (fontSize && lineHeight && lineHeight < fontSize && element.scrollHeight > fontSize * 1.35) {
        add('error', 'line-height', '多行文字的行高小于字号，会产生叠字；复制时会修正。');
      }
      if (getNumericPixels(computed.height) === 0 && !element.closest('svg,[data-role="absolute-layout"]')) {
        add('error', 'height', '文字容器高度为 0，在移动端可能完全不可见。');
      }
      if (/hidden|clip/.test(computed.overflowY) && element.scrollHeight > element.clientHeight + 2) {
        add('error', 'height', '文字超出固定高度容器并被裁剪。');
      }
    }

    // 深色模式（规范 4.1.1 / 4.1.2 / 4.6）：复制时我们会自动补 data-ignore-dm 保住原样，
    // 但作者若已手动声明过同类规则，就无需重复提示。
    {
      const dmRules = getIgnoreDmRules(element);
      if (hasGradientBackground(element) && hasVisibleText(element)
        && !dmRules.has(IGNORE_DM_TEXT_BG_GRADIENT) && !isNoDark(element)) {
        add('warning', 'Dark Mode 渐变', '文字背景使用了渐变，深色模式下会被混合成纯色；复制时会自动添加 data-ignore-dm="text-bg-gradient" 保留原样。');
      }
      const ownColor = style.color;
      if (ownColor && hasVisibleText(element)
        && !dmRules.has(IGNORE_DM_LOW_CONTRAST) && !isNoDark(element)) {
        const backdrop = resolveBackdropColor(element);
        const ratio = backdrop ? contrastRatio(ownColor, backdrop) : null;
        if (ratio !== null && ratio < 3) {
          add('warning', 'Dark Mode 对比度', `文字与背景对比度约 ${ratio.toFixed(1)}:1（偏低），深色模式会调整该颜色；复制时会自动添加 data-ignore-dm="low-contrast" 保留原样。`);
        }
      }
    }

    // 规范 1.4：宽度/居中/溢出。复制时会自动为该元素补 data-ignore-width 让后台放行，
    // 因此"固定宽度"本身不再是问题，只在**确实会被裁切或挤压**时提醒作者。
    if (!isWidthExempt(element) && computed) {
      const clamped = findClampingAncestor(element as HTMLElement);
      if (clamped) {
        add('warning', 'width 嵌套溢出', `该元素宽 ${style.width}，超出外层固定宽度容器（可用约 ${Math.round(clamped.available)}px）。复制时会自动补 data-ignore-width 让后台放行，但窄屏下仍可能被裁切，建议改用百分比宽度。`);
      }
      if (hasVisibleText(element) && hasCrampedTextWidth(element as HTMLElement)) {
        add('error', 'width 文本挤压', '容器固定宽度扣掉内边距后不足以排下一个汉字，正文会逐字换行；请加大宽度或改用 auto。');
      }
    }

    if (tag === 'pre' && hasVisibleText(element) && !element.querySelector('code')) add('warning', 'pre', '普通正文使用了 pre 标签，移动端可能不换行。');
    if (tag === 'span' && element.hasAttribute('leaf') && element.querySelector('section,div,p,article,main,table')) add('error', 'span[leaf]', 'span[leaf] 内包含块级元素。');
    if (tag === 'section' && element.hasAttribute('nodeleaf') && element.querySelector(':scope > :not(img)')) add('error', 'section[nodeleaf]', 'section[nodeleaf] 内含非图片、非官方组件元素。');
    if (redundantNestingDepth(element) > 10) add('warning', '嵌套层级', '相同标签与样式连续嵌套超过 10 层，公众号会自动精简。');
    if ((computed?.position === 'absolute' || style.transform) && hasVisibleText(element)) add('warning', 'Dark Mode 结构', '文字使用绝对定位或变形，视觉顺序可能与 DOM 结构不一致。');
  });

  doc.body.querySelectorAll('animate[begin]').forEach((animate) => {
    const begin = animate.getAttribute('begin') || '';
    if (/touchstart/i.test(begin) && !/click/i.test(begin)) add('warning', 'SVG begin', 'SVG 动画只有 touchstart，复制时会补充 click。');
  });

  return issues;
}

function normaliseWechatTree(root: HTMLElement, sourceDoc: Document) {
  const fixes = new Set<string>();
  root.querySelectorAll<HTMLElement>('*').forEach((element) => {
    const tag = element.tagName.toLowerCase();

    // 规范第 3 章：不建议设置任何 font-family，统一交给公众号默认字体栈。
    if (element.style.fontFamily) {
      element.style.removeProperty('font-family');
      fixes.add('移除自定义字体');
    }

    // 规范 4.5.2：移除 !important，避免干扰公共样式与深色模式算法。
    let hadImportant = false;
    for (const property of Array.from(element.style)) {
      if (element.style.getPropertyPriority(property)) {
        hadImportant = true;
        element.style.setProperty(property, element.style.getPropertyValue(property));
      }
    }
    if (hadImportant) fixes.add('移除 !important');

    if (element.style.caretColor) {
      element.style.removeProperty('caret-color');
      fixes.add('移除光标颜色');
    }

    // 规范 1.4.4：不再改写固定宽度，而是保留原样 + 追加官方豁免属性 data-ignore-width。
    // 早期版本会把 width:900px 改写成 width:auto;max-width:900px —— 那等于擅自改掉了作者的
    // 设计尺寸，导致"本地预览与公众号不一致"。现在改为信任作者：保留尺寸，用官方通道让后台放行。
    // 官方语义为子树级（父级标记后后代全部跳过检测），但这里仍给每个写了 px 宽度的节点单独标记：
    //   ① 更明确地表达"这个尺寸是刻意的"；
    //   ② 避免作者日后把元素从父容器里挪出来时豁免意外失效。
    if (
      isFixedPixelValue(element.style.width) &&
      tag !== 'svg' &&
      tag !== 'img' &&
      !element.hasAttribute('data-ignore-width')
    ) {
      element.setAttribute('data-ignore-width', '');
      fixes.add('固定宽度豁免');
    }

    // 规范 1.4.2：非 px 的宽度值（百分比、calc、em 等）镜像成 max-width，
    // 既保留作者写的 width，又多一层防溢出保护。仅在本节点没有 max-width 时补。
    if (
      element.style.width &&
      !isFixedPixelValue(element.style.width) &&
      !element.style.maxWidth &&
      tag !== 'svg' &&
      tag !== 'img'
    ) {
      element.style.maxWidth = element.style.width;
      fixes.add('宽度防溢出');
    }

    // 规范 1.4：普惠补 box-sizing:border-box，保证 width 语义一致
    // （含 border/padding 的总宽），这也是 data-ignore-width 能正确工作的前提。
    if (
      element.style.width &&
      tag !== 'svg' &&
      tag !== 'img' &&
      !element.style.boxSizing
    ) {
      element.style.boxSizing = 'border-box';
    }

    // 规范 1.4.2：水平边距防溢出。
    // margin 已加入 EXPLICIT_ONLY，产物里只会保留作者真正写过的值，不再被浏览器计算值污染。
    // 这里只做两件事：① 两侧相等（典型是 margin:0 auto 被物化）归位为 auto 居中；
    //                 ② 单侧固定 px 清零，避免窄屏右溢出。其余情况原样保留。
    if (tag !== 'svg' && tag !== 'img' && !isWidthExempt(element)) {
      const ml = (element.style.marginLeft || '').trim();
      const mr = (element.style.marginRight || '').trim();
      if (ml || mr) {
        if (isFixedPixelValue(ml) && isFixedPixelValue(mr) && ml === mr) {
          element.style.marginLeft = 'auto';
          element.style.marginRight = 'auto';
          fixes.add('居中归位');
        } else if (isFixedPixelValue(ml) && !mr) {
          element.style.marginLeft = '0';
          fixes.add('避免右溢出');
        } else if (!ml && isFixedPixelValue(mr)) {
          element.style.marginRight = '0';
          fixes.add('避免左溢出');
        }
      }
    }

    // 规范 1.5.1：height:0 且含文字的容器在移动端不可见，移除高度。
    if (hasVisibleText(element) && /^0(?:\.0+)?px$/i.test(element.style.height || '')) {
      element.style.removeProperty('height');
      fixes.add('移除零高度');
    }

    // 规范 4.1.2 / 4.6：文字叠加在渐变背景上时，深色模式算法会先 mix 成纯色再转换。
    // 自动补 data-ignore-dm="text-bg-gradient" 保住渐变原样（官方认可的通关姿势）。
    // ⚠️ data-ignore-dm 只对当前节点生效，父子需各自标记 —— 这也是 135 父子都贴的原因。
    if (hasGradientBackground(element) && hasVisibleText(element) && !isNoDark(element)) {
      if (appendIgnoreDm(element, IGNORE_DM_TEXT_BG_GRADIENT)) fixes.add('渐变深色豁免');
    }

    // 规范 4.1.1 / 4.6：文字与背景对比度过低时算法会改写颜色。
    // 用 WCAG 对比度静态推算（不依赖渲染测量），低于 3:1 就补 low-contrast 豁免。
    if (element.style.color && hasVisibleText(element) && !isNoDark(element)) {
      const backdrop = resolveBackdropColor(element);
      const ratio = backdrop ? contrastRatio(element.style.color, backdrop) : null;
      if (ratio !== null && ratio < 3) {
        if (appendIgnoreDm(element, IGNORE_DM_LOW_CONTRAST)) fixes.add('低对比度豁免');
      }
    }

    if (element.style.textAlign) {
      const textAlign = normaliseTextAlign(element.style.textAlign);
      if (textAlign !== element.style.textAlign) {
        if (textAlign) element.style.textAlign = textAlign;
        else element.style.removeProperty('text-align');
        fixes.add('兼容文字对齐');
      }
    }

    // HTML 的 align 属性同样参与对齐解析，统一转换为标准内联 text-align。
    const alignAttribute = element.getAttribute('align');
    if (alignAttribute) {
      const mapped = normaliseTextAlign(alignAttribute);
      if (mapped && !element.style.textAlign) element.style.textAlign = mapped;
      element.removeAttribute('align');
      fixes.add('兼容文字对齐');
    }

    // 反向镜像（135 编辑器的做法）：把 text-align 的值同步到 align 属性上。
    // 部分解析器只读 align 属性，双写能提高跨端一致性；值保持原样，不做语义转换。
    const finalAlign = element.style.textAlign;
    if (finalAlign && !element.getAttribute('align')) {
      element.setAttribute('align', finalAlign);
    }
    if (element.tagName === 'IMG') {
      // 规范 1.1：opacity:0 的图片发布后无法在后台选中或替换，强制恢复可见。
      if (getNumericPixels(element.style.opacity || '1') === 0) {
        element.style.removeProperty('opacity');
        fixes.add('恢复图片不透明度');
      }
      element.style.maxWidth = '100%';
      element.style.height = 'auto';
      const elementSource = element.getAttribute('src') || '';
      const source = Array.from(sourceDoc.images).find((image) => image.getAttribute('src') === elementSource);
      if (!element.hasAttribute('data-w') && source?.naturalWidth) element.setAttribute('data-w', String(source.naturalWidth));
    }
    if (hasVisibleText(element)) {
      const fontSize = getNumericPixels(element.style.fontSize);
      const lineHeight = getNumericPixels(element.style.lineHeight);
      if (fontSize && lineHeight && lineHeight < fontSize) {
        element.style.lineHeight = '1.5';
        fixes.add('修正文字行高');
      }
    }
  });

  root.querySelectorAll('animate[begin]').forEach((animate) => {
    const begin = animate.getAttribute('begin') || '';
    if (/touchstart/i.test(begin) && !/click/i.test(begin)) {
      animate.setAttribute('begin', `${begin}; click`);
      fixes.add('补充 SVG 点击事件');
    }
  });
  root.querySelectorAll('pre:not(:has(code))').forEach((pre) => {
    const paragraph = document.createElement('p');
    for (const attribute of Array.from(pre.attributes)) paragraph.setAttribute(attribute.name, attribute.value);
    paragraph.innerHTML = pre.innerHTML;
    paragraph.style.whiteSpace = 'normal';
    pre.replaceWith(paragraph);
    fixes.add('转换普通 pre 段落');
  });
  Array.from(root.querySelectorAll('*')).reverse().forEach((element) => {
    if (redundantNestingDepth(element) > 10 && element.parentElement) {
      element.replaceWith(...Array.from(element.childNodes));
      fixes.add('精简重复嵌套');
    }
  });
  return [...fixes];
}

// 公众号编辑器对粘贴内容做"白名单清洗"，已知会剥掉三类常见排版：
//   ① 空 <div> 整段删除 —— 装饰线（.rule 之类的 width/height/background 小元素）会消失
//   ② <div> 的 background / border-left / box-shadow 经常被过滤 —— 引用块塌成纯文字
//   ③ 这些 div 的外层样式只对 div 生效，转成白名单里的 <blockquote> / <hr> 后才能稳定保留
// 这一步把这类 div 转成更"语义化"的白名单标签，把视觉样式搬到新标签上。
function adaptForWechatEditor(root: HTMLElement): string[] {
  const fixes = new Set<string>();

  // 公众号把标题里的 <br> 解释为"段落分隔"，导致第二段失去原标题样式（字号、字重、对齐）。
  // 拆成两个独立标题可确保样式完整继承。
  root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    const brs = Array.from(heading.querySelectorAll('br'));
    if (brs.length === 0) return;
    for (const br of brs) {
      const following: Node[] = [];
      let next: Node | null = br.nextSibling;
      while (next) {
        following.push(next);
        next = next.nextSibling;
      }
      if (following.length === 0) {
        br.remove();
        continue;
      }
      const second = document.createElement(heading.tagName);
      second.style.cssText = heading.style.cssText;
      following.forEach((node) => second.appendChild(node));
      heading.parentNode?.insertBefore(second, heading.nextSibling);
      br.remove();
      fixes.add('标题换行拆分');
    }
  });

  // ① 含 border-left 且 width ≥ 3px 的 div 转 <blockquote>（公众号白名单里的引用语义）
  root.querySelectorAll<HTMLElement>('div').forEach((div) => {
    if (!div.textContent?.trim()) return;
    const s = div.style;
    const borderLeftWidth = parseFloat(s.borderLeftWidth);
    if (!Number.isFinite(borderLeftWidth) || borderLeftWidth < 3) return;
    if (s.borderLeftStyle !== 'solid') return;
    const bq = document.createElement('blockquote');
    bq.style.cssText = div.style.cssText;
    // blockquote 默认带 margin/缩进，统一清零，靠用户的 padding/background 撑住视觉
    if (!s.marginLeft && !s.marginRight) {
      bq.style.marginLeft = '0';
      bq.style.marginRight = '0';
    }
    if (!s.paddingLeft && !s.paddingRight) {
      bq.style.paddingLeft = '10px';
      bq.style.paddingRight = '10px';
    }
    bq.innerHTML = div.innerHTML;
    div.replaceWith(bq);
    fixes.add('引用块 → blockquote');
  });

  // ② 小尺寸 + 有背景/圆角的空 div 转 <hr>（公众号白名单里的水平线语义）
  //    识别条件：完全空 + width/height 都 ≤ 200/30 + 有 background-color 或 border-radius + 宽高比 ≥ 3:1
  root.querySelectorAll<HTMLElement>('div').forEach((div) => {
    if (div.textContent?.trim()) return;
    if (div.querySelector('img, video, audio, br')) return;
    const s = div.style;
    const w = parseFloat(s.width);
    const h = parseFloat(s.height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    if (w > 200 || h > 30) return;
    if (!s.backgroundColor && !s.borderRadius) return;
    if (w / h < 3 && h / w < 3) return; // 宽高比不极端，不是"线"
    const hr = document.createElement('hr');
    hr.style.cssText = s.cssText;
    hr.style.border = '0'; // 清除 <hr> 默认的 inset border
    div.replaceWith(hr);
    fixes.add('装饰线 → hr');
  });

  // ③ 公众号编辑器（新版底层是 ProseMirror）的白名单里没有 div / main / article 等容器标签，
  //    粘贴时会把这类标签"整段吞掉"，连带内联的 color / text-align 一起丢失，只剩纯文字
  //    —— 同一份产物里 <p> 的样式能保留、<div> 的不能，根因就在这里。
  //    统一换成白名单内、且支持嵌套的 <section>：视觉与 div 完全一致（同为无默认样式的块级元素），
  //    样式则可完整保留。
  //    注意必须由内向外处理（reverse），否则外层先被替换后，内层元素会脱离文档而漏转。
  const NON_WHITELIST_CONTAINERS = [
    'div', 'main', 'article', 'aside', 'header', 'footer', 'nav',
    'figure', 'figcaption', 'address', 'hgroup', 'fieldset', 'center', 'dl', 'dt', 'dd',
  ];
  Array.from(root.querySelectorAll<HTMLElement>(NON_WHITELIST_CONTAINERS.join(','))).reverse().forEach((element) => {
    const section = document.createElement('section');
    section.style.cssText = element.style.cssText;
    // 标签会被替换，属性必须手工搬运 —— 尤其是官方豁免属性，
    // 丢了它等于作者写的 data-ignore-width 白写，后台又会去查宽度。
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name === 'style') continue;
      section.setAttribute(attribute.name, attribute.value);
    }
    section.innerHTML = element.innerHTML;
    element.replaceWith(section);
    fixes.add('容器 → section');
  });

  return Array.from(fixes);
}

function createWechatHtml(doc: Document) {
  const sourceBody = doc.body;
  const cloneBody = sourceBody.cloneNode(true) as HTMLElement;
  const sourceElements = [sourceBody, ...Array.from(sourceBody.querySelectorAll('*'))];
  const cloneElements = [cloneBody, ...Array.from(cloneBody.querySelectorAll('*'))];
  let localImageCount = 0;

  sourceElements.forEach((source, index) => {
    const target = cloneElements[index] as HTMLElement | SVGElement | undefined;
    if (!target || !('style' in target)) return;
    const computed = doc.defaultView?.getComputedStyle(source);
    const parentComputed = source.parentElement ? doc.defaultView?.getComputedStyle(source.parentElement) : null;

    for (const attribute of Array.from(target.attributes)) {
      // 移除事件属性、编辑器注入的噪音 data-*，以及会与宿主环境冲突的 id / contenteditable。
      // 例外一：WECHAT_EXEMPT_ATTRIBUTES 是官方认可的豁免标记，必须原样带进剪贴板，
      //         否则公众号后台的宽度/深色模式算法就认不出来了 —— 加它就是为了让后台放行。
      // 例外二：class 保留（与 135 编辑器一致）。公众号后台会剥掉 class，但保留它有两个好处：
      //         ① 导出的 .html 文件仍可配合样式表使用；② 某些公众号第三方模板靠 class 识别组件。
      if (WECHAT_EXEMPT_ATTRIBUTES.includes(attribute.name.toLowerCase() as (typeof WECHAT_EXEMPT_ATTRIBUTES)[number])) {
        // 官方语义只看属性名是否存在，值无意义 —— 作者写 data-ignore-dm（无值）时浏览器会序列化成
        // data-ignore-dm=""，这是 HTML 规范行为，无需也无法抹掉，原样保留即可。
        continue;
      }
      if (
        /^on/i.test(attribute.name) ||
        ['id', 'contenteditable', 'spellcheck'].includes(attribute.name) ||
        // 其余 data-* 一律视为工具注入的噪音（豁免属性已在上面放行）。
        /^data-/i.test(attribute.name)
      ) {
        target.removeAttribute(attribute.name);
      }
    }

    if (computed) {
      const rootComputed = doc.documentElement ? doc.defaultView?.getComputedStyle(doc.documentElement) : null;
      // 居中容器（左右外边距来自 margin:auto）会被浏览器物化成两个相等的像素值，
      // 例如 margin:0 auto 在 677px 容器里变成 margin-left/right: 54.5px。
      // 直接写进产物等于把"居中"钉死成某个屏幕宽度的固定偏移，窄屏必然偏移。
      // 这里先探测一次，命中则把这一对值还原成 auto。
      const computedMarginLeft = computed.getPropertyValue('margin-left').trim();
      const computedMarginRight = computed.getPropertyValue('margin-right').trim();
      const marginAutoRestore =
        isFixedPixelValue(computedMarginLeft) &&
        computedMarginLeft === computedMarginRight &&
        (source as HTMLElement).style?.width !== undefined;
      STYLE_PROPERTIES.forEach((property) => {
        let value = computed.getPropertyValue(property).trim();
        const rootDefault = rootComputed ? rootComputed.getPropertyValue(property).trim() : '';
        // text-align 中只有官方规范 1.6 点名的 start/end 需要归一化（justify 等值原样保留）。
        if (property === 'text-align') value = normaliseTextAlign(value);
        // margin-left/right 的等值像素对还原为 auto，保持作者「居中」的原意。
        if (marginAutoRestore && (property === 'margin-left' || property === 'margin-right')) value = 'auto';
        const inheritedFromParent = INHERITED_PROPERTIES.has(property) && parentComputed?.getPropertyValue(property).trim() === value;
        const explicitlySet = 'style' in source && Boolean((source as HTMLElement).style.getPropertyValue(property));
        const authoredGeometry = !EXPLICIT_ONLY_PROPERTIES.has(property) || explicitlySet || hasStylesheetProperty(source, property);
        // 归一化后为空（未知/非法 text-align 值）时视为无样式，不写入。
        if (property === 'text-align' && value === '') return;
        // 严格按 EXPLICIT_ONLY 过滤：作者没写过、没命中样式表的“几何/布局”属性一律不写入，
        // 否则会把 transform-origin / flex-flow / grid-auto-flow 等默认值倒进剪贴板产物。
        if (!authoredGeometry) return;
        // 与根元素计算值相同的视作浏览器默认值（覆盖 list-style-type:disc / border-color / vertical-align 等无法用 EXPLICIT_ONLY 表达的零碎属性）。
        const isBrowserDefault = value !== '' && (value === rootDefault || (GEOMETRY_PROPERTY_DEFAULTS[property] || []).includes(value));
        if ((!EMPTY_VALUES.has(value) && !inheritedFromParent && !isBrowserDefault) || explicitlySet) target.style.setProperty(property, value);
      });
    }

    if (target instanceof HTMLElement) {
      const before = createMaterialisedPseudo(doc, source, '::before');
      const after = createMaterialisedPseudo(doc, source, '::after');
      if (before) target.prepend(before);
      if (after) target.append(after);
    }

    if (target.tagName.toLowerCase() === 'img') {
      const src = target.getAttribute('src') || '';
      if (src && !/^(https?:\/\/|data:image\/)/i.test(src)) localImageCount += 1;
      target.style.setProperty('max-width', '100%');
      if (!target.style.width) target.style.setProperty('width', 'auto');
      if (!target.style.height) target.style.setProperty('height', 'auto');
    }
  });

  cloneBody.querySelectorAll('script, style, link, iframe, object, embed, form, input, textarea, select, button').forEach((node) => node.remove());
  cloneBody.querySelectorAll('a').forEach((anchor) => {
    if (/^\s*javascript:/i.test(anchor.getAttribute('href') || '')) anchor.removeAttribute('href');
  });
  cloneBody.querySelectorAll('p').forEach((paragraph) => {
    if (!paragraph.textContent?.trim() && !paragraph.querySelector('img, video, audio')) paragraph.innerHTML = '<br>';
  });

  const fixes = normaliseWechatTree(cloneBody, doc);
  // 公众号后台粘贴的"白名单清洗"会剥掉空 div 与 div 的 background/border，
  // 把符合模式的目标转成白名单标签（<blockquote>、<hr>）后再包 wrapper。
  fixes.push(...adaptForWechatEditor(cloneBody));

  const wrapper = document.createElement('section');
  wrapper.setAttribute('data-wechat-html-editor', 'true');
  wrapper.style.cssText = 'box-sizing:border-box;font-size:16px;line-height:1.75;color:#27272a;overflow-wrap:break-word;';
  wrapper.innerHTML = cloneBody.innerHTML.trim();
  return { html: wrapper.outerHTML, text: sourceBody.innerText.trim(), localImageCount, fixes };
}

function rewriteResponsiveLayout(input: string): { html: string; changed: boolean; count: number } {
  // 最后一道兜底：直接对产物 HTML 字符串做一次 DOM 解析，补齐 DOM 路径可能漏掉的豁免标记。
  // ⚠️ 这里**不再改写宽度**。早期版本会把 width>320px 的容器改成 max-width + width:auto，
  //    那等于擅自改掉作者的设计尺寸，是"本地预览与公众号不一致"的主因。
  //    官方规范 1.4.4 提供了 data-ignore-width 豁免通道，正确做法是保留尺寸 + 打标记。
  //    两道兜底：① 固定 px 宽度补 data-ignore-width ② 缺 box-sizing 的补 border-box。
  if (typeof DOMParser === 'undefined') {
    return { html: input, changed: false, count: 0 };
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="__root__">${input}</div>`, 'text/html');
    const root = doc.getElementById('__root__');
    if (!root) return { html: input, changed: false, count: 0 };
    let count = 0;
    root.querySelectorAll<HTMLElement>('*').forEach((element) => {
      const tag = element.tagName.toLowerCase();
      if (tag === 'svg' || tag === 'img') return;
      const style = element.style;

      // ① 固定 px 宽度：补官方豁免属性。逐个节点显式标记，不依赖父级的子树级豁免，
      //    这样即使元素被挪出父容器，豁免也不会意外失效。
      if (isFixedPixelValue(style.width) && !element.hasAttribute('data-ignore-width')) {
        element.setAttribute('data-ignore-width', '');
        count += 1;
      }

      // ② 有宽度但没写 box-sizing 的，补齐 border-box，保证 width 语义与设计一致
      if (style.width && !style.boxSizing) {
        style.boxSizing = 'border-box';
        count += 1;
      }
    });
    if (!count) return { html: input, changed: false, count: 0 };
    // 只取内层内容：`#__root__` 只是解析用的临时包裹，整体序列化会把它（连同 xmlns 与 id）
    // 一起写进剪贴板 —— 而 div 正是公众号会整段吞掉的标签。
    // 这里用 innerHTML 与 createWechatHtml 的序列化方式保持一致，避免混入 xmlns 等 XML 残留。
    return { html: root.innerHTML, changed: true, count };
  } catch {
    return { html: input, changed: false, count: 0 };
  }
}

async function writeRichClipboard(html: string, text: string) {
  // 首选精确写入 text/html（ClipboardItem）：粘贴进公众号的内容与清洗后的字符串逐字一致，
  // 不会经浏览器 DOM 二次序列化，避免重新引入 text-align:start 等非标准值。
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return;
    } catch {
      // ClipboardItem 不可用或权限受限时，走选区 + execCommand 兜底。
    }
  }

  const helper = document.createElement('div');
  helper.setAttribute('contenteditable', 'true');
  helper.setAttribute('aria-hidden', 'true');
  helper.style.cssText = 'position:fixed;left:-10000px;top:0;width:677px;background:#fff;';
  helper.innerHTML = html;
  document.body.appendChild(helper);
  const selection = window.getSelection();
  const previousRanges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const range = document.createRange();
  range.selectNodeContents(helper);
  selection?.removeAllRanges();
  selection?.addRange(range);
  const copied = document.execCommand('copy');
  selection?.removeAllRanges();
  previousRanges.forEach((previousRange) => selection?.addRange(previousRange));
  helper.remove();
  if (copied) return;

  throw new Error('浏览器拒绝了复制操作');
}

export function EditorWorkspace() {
  // SSR/hydration 阶段 state 用稳定默认值，保证服务端与客户端首帧一致、不触发 Hydration mismatch；
  // 挂载后（hydrated=true）再从 localStorage 一次性恢复保存内容，避免“默认内容闪一下”。
  const [sourceHtml, setSourceHtml] = useState(STARTER_HTML);
  const [previewHtml, setPreviewHtml] = useState(STARTER_HTML);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState('preview');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 每次载入/重置/清空内容时 +1，作为 iframe 的 key，强制重建预览 iframe，
  // 避免在 contentEditable iframe 上原地更新 srcDoc 有时不刷新导致的“导入后仍空白”。
  const [previewKey, setPreviewKey] = useState(0);

  const articleTitle = useMemo(() => getDocumentTitle(sourceHtml), [sourceHtml]);

  useEffect(() => {
    const saved = safeStorage.get(STORAGE_KEY);
    if (saved) {
      setSourceHtml(saved);
      setPreviewHtml(saved);
      setNotice({ kind: 'success', title: '已恢复上次文章', detail: '内容只保存在这台电脑的浏览器中。' });
    }
    setHydrated(true);
  }, []);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const persist = (html: string) => {
    setSourceHtml(html);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => window.localStorage.setItem(STORAGE_KEY, html), 350);
  };

  const loadHtml = (html: string, fileName?: string) => {
    try {
      const cleaned = cleanPreviewDocument(html);
      persist(cleaned);
      setPreviewHtml(cleaned);
      setPreviewKey((k) => k + 1); // 强制重建预览 iframe
      setActiveTab('preview');
      setNotice({ kind: 'success', title: 'HTML 已导入', detail: fileName ? `已载入 ${fileName}，可以直接编辑或复制。` : '预览已根据源码更新。' });
    } catch {
      setNotice({ kind: 'error', title: '无法读取 HTML', detail: '请确认内容是有效的 HTML 文档或片段。' });
    }
  };

  const loadHtmlRef = useRef(loadHtml);
  loadHtmlRef.current = loadHtml;

  useEffect(() => {
    type ToolDefinition = {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    };
    type ModelContext = { registerTool: (tool: ToolDefinition, options?: { signal?: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool: ToolDefinition = {
      name: 'load_html_document',
      title: '导入 HTML 文章',
      description: '把完整 HTML 文档或 HTML 片段载入公众号排版助手，并更新可编辑预览。',
      inputSchema: {
        type: 'object',
        properties: { html: { type: 'string', description: '需要载入的 HTML 内容' } },
        required: ['html'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input !== 'object' || typeof (input as { html?: unknown }).html !== 'string') {
          throw new Error('html 必须是字符串');
        }
        const html = (input as { html: string }).html;
        loadHtmlRef.current(html, 'AI 提供的 HTML');
        return { status: 'loaded', characters: html.length };
      },
    };
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    } catch {
      return;
    }
    return () => lifecycle.abort();
  }, []);

  const readFile = async (file?: File) => {
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && !/html/i.test(file.type)) {
      setNotice({ kind: 'error', title: '文件格式不支持', detail: `「${file.name}」不是 HTML 文件，请选择 .html 或 .htm 文件。` });
      return;
    }
    loadHtml(await file.text(), file.name);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void readFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void readFile(event.dataTransfer.files?.[0]);
  };

  // 拖拽过程中检测类型：非 HTML 文件时不让"可放置"光标出现，也不高亮拖拽区。
  const isHtmlFileDrag = (event: DragEvent<HTMLElement>) => {
    const items = Array.from(event.dataTransfer?.items || []);
    return items.some((item) => {
      if (item.kind !== 'file') return false;
      const file = item.getAsFile();
      return !file || /\.html?$/i.test(file.name) || /html/i.test(file.type);
    });
  };

  const handleFrameLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    doc.body.contentEditable = 'true';
    doc.body.spellcheck = true;
    setValidationIssues(validateWechatDocument(doc));
    doc.body.addEventListener('input', () => {
      persist(serialiseEditableDocument(doc));
      setValidationIssues(validateWechatDocument(doc));
    });
  };

  const runValidation = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    const issues = validateWechatDocument(doc);
    setValidationIssues(issues);
    setNotice({
      kind: issues.some((issue) => issue.level === 'error') ? 'warning' : 'success',
      title: issues.length ? `检查完成：发现 ${issues.length} 项` : '符合微信排版规范',
      detail: issues.length ? '复制时会自动修正可安全处理的项目，其余项目请参考左侧提示。' : '没有发现常见的结构、宽度或深色模式问题。',
    });
  };

  const runCommand = (command: string) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.execCommand(command, false);
    doc.body.focus();
    persist(serialiseEditableDocument(doc));
  };

  const copyToWechat = async () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) {
      setNotice({ kind: 'error', title: '复制失败', detail: '预览尚未准备好，请稍后再试。' });
      return;
    }
    setIsCopying(true);
    try {
      setValidationIssues(validateWechatDocument(doc));
      const result = createWechatHtml(doc);
      // 最终兜底：只归一化官方规范 1.6 点名的 start/end（justify 等值原样保留）。
      // 直接处理字符串比 DOM 路径更可靠 —— 万一有值没被 normaliseTextAlign 拦住，这层也能兜住。
      let alignFixed = 0;
      let finalHtml = result.html.replace(
        /text-align\s*:\s*(start|end|-webkit-left|-webkit-right|-webkit-center|-moz-left|-moz-right|-moz-center)(?![a-z-])/gi,
        (_match, value: string) => {
          alignFixed += 1;
          const normalized = normaliseTextAlign(value);
          return normalized ? `text-align: ${normalized}` : '';
        },
      );
      if (alignFixed) result.fixes.push(`兼容文字对齐 ×${alignFixed}`);

      // 最终兜底：补官方豁免属性（规范 1.4.4）与 box-sizing。
      // 这里**不再改写宽度** —— 改为保留作者的固定尺寸 + 打 data-ignore-width 标记让后台放行。
      const layoutFixed = rewriteResponsiveLayout(finalHtml);
      if (layoutFixed.changed) {
        finalHtml = layoutFixed.html;
        if (layoutFixed.count) result.fixes.push(`宽度豁免 ×${layoutFixed.count}`);
      }

      await writeRichClipboard(finalHtml, result.text);
      setNotice({
        kind: result.localImageCount ? 'warning' : 'success',
        title: result.localImageCount ? '复制成功，但发现本地图片' : '已复制为公众号富文本',
        detail: result.localImageCount ? `有 ${result.localImageCount} 张图片使用本地路径，粘贴后可能无法显示。` : result.fixes.length ? `已自动处理：${result.fixes.join('、')}。现在可粘贴到公众号。` : '现在切换到公众号后台，直接粘贴即可。',
      });
    } catch (error) {
      setNotice({ kind: 'error', title: '复制失败', detail: error instanceof Error ? error.message : '请检查浏览器剪贴板权限后重试。' });
    } finally {
      setIsCopying(false);
    }
  };

  const downloadHtml = () => {
    const doc = iframeRef.current?.contentDocument;
    const html = doc ? serialiseEditableDocument(doc) : sourceHtml;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${articleTitle.replace(/[\\/:*?"<>|]/g, '-') || '公众号文章'}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const resetDocument = () => {
    safeStorage.remove(STORAGE_KEY);
    setSourceHtml(STARTER_HTML);
    setPreviewHtml(STARTER_HTML);
    setPreviewKey((k) => k + 1);
    setValidationIssues([]);
    setActiveTab('preview');
    setNotice({ kind: 'success', title: '已恢复示例文章', detail: '浏览器中的旧草稿已清除。' });
  };

  // 一键清空：清空编辑器到空白的干净 HTML，保留文档骨架，方便从零开始排版。
  const clearAll = () => {
    const empty = '<html><head><meta charset="utf-8"></head><body></body></html>';
    const cleaned = cleanPreviewDocument(empty);
    persist(cleaned);
    setPreviewHtml(cleaned);
    setPreviewKey((k) => k + 1);
    setValidationIssues([]);
    setActiveTab('preview');
    setNotice({ kind: 'success', title: '已清空编辑器', detail: '内容已清空，可以直接开始排版新文章。' });
  };

  const changeTab = (value: string | number) => {
    const nextTab = String(value);
    if (nextTab === 'source') {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) persist(serialiseEditableDocument(doc));
    } else if (nextTab === 'preview' && activeTab === 'source') {
      try {
        const cleaned = cleanPreviewDocument(sourceHtml);
        persist(cleaned);
        setPreviewHtml(cleaned);
        setPreviewKey((k) => k + 1);
      } catch {
        setNotice({ kind: 'error', title: '源码无法预览', detail: '请检查 HTML 是否完整。' });
        return;
      }
    }
    setActiveTab(nextTab);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex min-h-16 max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Icon name="file" className="size-5" /></span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">公众号排版助手</h1>
              <p className="truncate text-xs text-muted-foreground">本地保存 · 无需登录</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button size="lg" onClick={() => void copyToWechat()} disabled={isCopying} className="min-h-11 bg-[#b28a2f] px-4 text-white hover:bg-[#94701f]">
              {isCopying ? <Icon name="reset" className="animate-spin" /> : <Icon name="clipboard" />}
              {isCopying ? '正在复制' : '复制到公众号'}
            </Button>
          </div>
          <input ref={fileInputRef} className="sr-only" type="file" accept=".html,.htm,text/html" onChange={handleFileChange} aria-label="选择 HTML 文件" />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6 lg:py-6">
        <aside className="space-y-4">
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold">当前文章</p>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{articleTitle}</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button variant="outline" className="min-h-11 px-1" onClick={downloadHtml}><Icon name="download" />导出</Button>
              <Button variant="ghost" className="min-h-11 px-1" onClick={resetDocument}><Icon name="reset" />示例</Button>
              <Button variant="ghost" className="min-h-11 px-1 text-destructive hover:text-destructive" onClick={clearAll}><Icon name="trash" />清空</Button>
            </div>
          </section>

          <section
            role="button"
            tabIndex={0}
            aria-label="拖入或点击选择 HTML 文件"
            className={`group cursor-pointer rounded-2xl border border-dashed p-5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isDragging ? 'border-[#b28a2f] bg-[#fbf7ec]' : 'bg-card hover:border-[#b28a2f] hover:bg-[#fbf7ec]/60'}`}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              if (isHtmlFileDrag(event)) setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (isHtmlFileDrag(event)) {
                event.dataTransfer.dropEffect = 'copy';
                setIsDragging(true);
              } else {
                event.dataTransfer.dropEffect = 'none';
              }
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <span className={`mx-auto mb-3 grid size-11 place-items-center rounded-xl transition-colors ${isDragging ? 'bg-[#b28a2f] text-white' : 'bg-[#fbf7ec] text-[#9a7626] group-hover:bg-[#b28a2f] group-hover:text-white'}`}>
              <Icon name="upload" className="size-5" />
            </span>
            <p className="text-sm font-semibold">拖入 HTML 文件</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">或点击此处选择文件，仅支持 .html / .htm</p>
            <p className="mt-2 text-xs text-muted-foreground">文章不会上传，只在本地处理。</p>
          </section>

          <section className="rounded-2xl border bg-[#18181b] p-4 text-white">
            <div className="flex items-center gap-2 text-sm font-semibold"><Icon name="laptop" className="size-4 text-[#d4af56]" />粘贴前检查</div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
              <li>图片使用 HTTPS 公网地址</li>
              <li>先在公众号草稿中预览</li>
              <li>复杂动画与脚本不会复制</li>
            </ul>
          </section>

          <section className="rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby="validation-title">
            <div className="flex items-center gap-2">
              <Icon name="shield" className="size-4 text-[#9a7626]" />
              <p id="validation-title" className="text-sm font-semibold">微信规范检查</p>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${validationIssues.length ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {validationIssues.length ? `${validationIssues.length} 项` : '已通过'}
              </span>
            </div>
            {validationIssues.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-5 text-muted-foreground">
                {validationIssues.slice(0, 5).map((issue, index) => (
                  <li key={`${issue.rule}-${index}`} className="flex gap-2">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${issue.level === 'error' ? 'bg-red-500' : 'bg-amber-500'}`} aria-hidden="true" />
                    <span><strong className="font-medium text-foreground">{issue.rule}：</strong>{issue.message}</span>
                  </li>
                ))}
                {validationIssues.length > 5 && <li>另有 {validationIssues.length - 5} 项，复制时将尽量自动处理。</li>}
              </ul>
            ) : <p className="mt-2 text-sm leading-6 text-muted-foreground">文章会按微信官方常见规则检查。</p>}
            {validationIssues.length > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                点“复制到公众号”时会自动处理：文字对齐 start/end、自定义字体 font-family、<code>!important</code>、行高叠字等；固定宽度、渐变文字、低对比度会自动加上微信官方豁免属性（<code>data-ignore-width</code> / <code>data-ignore-dm</code>），尽量原样保留不裁切，粘贴后再校验一般不会重复提示。
              </p>
            )}
            <Button variant="outline" className="mt-4 min-h-11 w-full" onClick={runValidation}><Icon name="shield" />重新检查</Button>
          </section>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <Tabs value={activeTab} onValueChange={changeTab} className="h-full">
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-3 sm:px-4">
              <TabsList className="h-10">
                <TabsTrigger value="preview" className="min-h-9 px-3"><Icon name="file" />预览编辑</TabsTrigger>
                <TabsTrigger value="source" className="min-h-9 px-3"><Icon name="code" />HTML 源码</TabsTrigger>
              </TabsList>
              <div className={`ml-auto items-center gap-1 ${activeTab === 'preview' ? 'flex' : 'hidden'}`} aria-label="文字格式工具栏">
                <Button variant="ghost" size="icon-lg" aria-label="撤销" title="撤销" onClick={() => runCommand('undo')}><Icon name="undo" /></Button>
                <Button variant="ghost" size="icon-lg" aria-label="重做" title="重做" onClick={() => runCommand('redo')}><Icon name="redo" /></Button>
                <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
                <Button variant="ghost" size="icon-lg" aria-label="加粗" title="加粗" onClick={() => runCommand('bold')}><Icon name="bold" /></Button>
                <Button variant="ghost" size="icon-lg" aria-label="斜体" title="斜体" onClick={() => runCommand('italic')}><Icon name="italic" /></Button>
                <Button variant="ghost" size="icon-lg" aria-label="左对齐" title="左对齐" onClick={() => runCommand('justifyLeft')}><Icon name="align-left" /></Button>
                <Button variant="ghost" size="icon-lg" aria-label="居中" title="居中" onClick={() => runCommand('justifyCenter')}><Icon name="align-center" /></Button>
                <Button variant="ghost" size="icon-lg" aria-label="右对齐" title="右对齐" onClick={() => runCommand('justifyRight')}><Icon name="align-right" /></Button>
              </div>
            </div>

            <TabsContent value="preview" className="m-0 min-h-[68vh] bg-[#eef0f2] p-3 sm:p-6">
              <div className="mx-auto min-h-[64vh] w-full max-w-[725px] overflow-hidden rounded-md bg-white shadow-[0_12px_40px_rgb(24_24_27/10%)] ring-1 ring-black/5">
                {hydrated ? (
                  <iframe key={previewKey} ref={iframeRef} title="公众号文章可编辑预览" srcDoc={previewHtml} sandbox="allow-same-origin" onLoad={handleFrameLoad} className="h-[68vh] min-h-[620px] w-full bg-white" />
                ) : (
                  <div className="h-[68vh] min-h-[620px] w-full bg-white" />
                )}
              </div>
            </TabsContent>

            <TabsContent value="source" className="m-0 min-h-[68vh] p-4">
              <label htmlFor="html-source" className="mb-2 block text-sm font-medium">HTML 源码</label>
              <Textarea id="html-source" value={sourceHtml} onChange={(event) => persist(event.target.value)} spellCheck={false} className="min-h-[58vh] resize-y font-mono text-[13px] leading-6" />
              <div className="mt-3 flex justify-end"><Button className="min-h-11" onClick={() => loadHtml(sourceHtml)}>更新预览</Button></div>
            </TabsContent>
          </Tabs>
        </section>
      </div>

      {notice && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[min(520px,calc(100%-32px))] -translate-x-1/2">
          <Alert className={notice.kind === 'success' ? 'border-emerald-300 bg-emerald-50' : notice.kind === 'warning' ? 'border-amber-300 bg-amber-50' : 'border-red-300 bg-red-50'}>
            {notice.kind === 'success' && <Icon name="check" />}
            {notice.kind === 'warning' && <Icon name="upload" />}
            {notice.kind === 'error' && <Icon name="reset" />}
            <AlertTitle>{notice.title}</AlertTitle>
            <AlertDescription>{notice.detail}</AlertDescription>
            <Button variant="ghost" size="sm" className="absolute right-2 top-2" onClick={() => setNotice(null)} aria-label="关闭提示">关闭</Button>
          </Alert>
        </div>
      )}
    </main>
  );
}
