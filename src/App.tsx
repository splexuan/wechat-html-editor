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
  'justify-self', 'left', 'list-style-position', 'list-style-type', 'max-height', 'max-width', 'min-height',
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
  if (['left', 'right', 'center', 'justify'].includes(align)) return align;
  if (align === 'justify-all') return 'justify';
  if (/^(start|-webkit-left|-moz-left)$/.test(align)) return 'left';
  if (/^(end|-webkit-right|-moz-right)$/.test(align)) return 'right';
  if (/^(-webkit-center|-moz-center)$/.test(align)) return 'center';
  return '';
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

function validateWechatDocument(doc: Document): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (level: ValidationIssue['level'], rule: string, message: string) => {
    if (!issues.some((item) => item.rule === rule && item.message === message)) issues.push({ level, rule, message });
  };

  doc.body.querySelectorAll<HTMLElement>('*').forEach((element) => {
    const style = element.style;
    const computed = doc.defaultView?.getComputedStyle(element);
    const tag = element.tagName.toLowerCase();

    if (style.getPropertyValue('font-family')) add('warning', '字体', '检测到自定义 font-family，复制时会移除并使用公众号官方默认字体栈。');
    if (style.getPropertyPriority('color') === 'important' || style.cssText.includes('!important')) add('warning', '!important', '检测到 !important，复制时会移除优先级。');
    if (/^(start|end)$/i.test(style.textAlign)) add('warning', 'text-align', 'start/end 在不同终端表现不一致，复制时会转换。');
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
      if (/gradient\(/i.test(computed.backgroundImage) && hasVisibleText(element)) {
        add('warning', 'Dark Mode', '文字使用渐变背景，深色模式可能将它转换为纯色。');
      }
    }

    if (!element.closest('[data-ignore-width]') && computed) {
      const bodyRect = doc.body.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      if (rect.width > bodyRect.width + 2 || rect.right > bodyRect.right + 2 || rect.left < bodyRect.left - 2) {
        add('error', 'width', '存在超出文章可视宽度的内容，复制时会限制最大宽度。');
      } else if (isFixedPixelValue(style.width) && getNumericPixels(style.width) > 320 && tag !== 'svg') {
        add('warning', 'width', '检测到较大的固定像素宽度，窄屏下可能显示不一致。');
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

    // 规范 1.4：固定像素宽度（>320）会被微信判定“居中布局不一致”。
    // 对非 img/svg 的容器，把 width:NNNpx 改写为 max-width:NNNpx; width:auto，
    // 这样保留设计意图（限制最大宽度）、同时响应式不溢出。
    if (
      isFixedPixelValue(element.style.width) &&
      tag !== 'svg' &&
      tag !== 'img' &&
      getNumericPixels(element.style.width) > 320
    ) {
      const px = element.style.width;
      if (!element.style.maxWidth) element.style.maxWidth = px;
      element.style.width = 'auto';
      element.style.boxSizing = 'border-box';
      fixes.add('响应式容器');
    } else if (
      isFixedPixelValue(element.style.width) &&
      tag !== 'svg' &&
      tag !== 'img' &&
      !element.style.maxWidth
    ) {
      element.style.maxWidth = '100%';
      fixes.add('限制最大宽度');
    }

    // 规范 1.4.2：居中布局在窄屏上偏移导致溢出。
    // 浏览器会把 margin:0 auto 物化成 margin-left/right:NNNpx（来自父容器剩余空间），
    // 这会导致窄屏下内容右溢出。把这种“等于的两侧边距”归位为 auto 居中；
    // 不对称的固定水平边距直接清零，确保响应式安全。
    if (tag !== 'svg' && tag !== 'img') {
      const ml = (element.style.marginLeft || '').trim();
      const mr = (element.style.marginRight || '').trim();
      if (ml || mr) {
        if (isFixedPixelValue(ml) && isFixedPixelValue(mr) && ml === mr) {
          element.style.marginLeft = 'auto';
          element.style.marginRight = 'auto';
          fixes.add('响应式居中');
        } else if (isFixedPixelValue(ml) || isFixedPixelValue(mr)) {
          // 任意一侧是固定 px 都清零，避免窄屏溢出
          element.style.marginLeft = isFixedPixelValue(ml) ? '0' : element.style.marginLeft;
          element.style.marginRight = isFixedPixelValue(mr) ? '0' : element.style.marginRight;
          fixes.add('响应式边距');
        }
      }
    }

    // 规范 1.5.1：height:0 且含文字的容器在移动端不可见，移除高度。
    if (hasVisibleText(element) && /^0(?:\.0+)?px$/i.test(element.style.height || '')) {
      element.style.removeProperty('height');
      fixes.add('移除零高度');
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
      if (/^on/i.test(attribute.name) || ['class', 'id', 'contenteditable', 'spellcheck'].includes(attribute.name)) {
        target.removeAttribute(attribute.name);
      }
    }

    if (computed) {
      const rootComputed = doc.documentElement ? doc.defaultView?.getComputedStyle(doc.documentElement) : null;
      STYLE_PROPERTIES.forEach((property) => {
        let value = computed.getPropertyValue(property).trim();
        const rootDefault = rootComputed ? rootComputed.getPropertyValue(property).trim() : '';
        // text-align 非标准值（start/end 等）在此直接归一化，杜绝其进入产物（微信规范 1.6）。
        if (property === 'text-align') value = normaliseTextAlign(value);
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
  // 解析产物 HTML，做两道响应式清理，覆盖 normaliseWechatTree 漏掉的角落：
  //   ① 非 img/svg 且 width > 320px 的容器改成 max-width + width:auto（规范 1.4.1）
  //   ② margin-left/right 为固定 px 的容器：相等则归位为 auto 居中；不对称则清零（规范 1.4.2）
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
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
      const rawWidth = (element.getAttribute('style') || '').match(/(?:^|;)\s*width\s*:\s*([^;]+)/i);
      const width = rawWidth ? rawWidth[1].trim() : '';
      if (width && isFixedPixelValue(width) && getNumericPixels(width) > 320) {
        if (!style.maxWidth) style.maxWidth = width;
        style.width = 'auto';
        if (!style.boxSizing) style.boxSizing = 'border-box';
        count += 1;
      }
      const ml = (style.marginLeft || '').trim();
      const mr = (style.marginRight || '').trim();
      if (isFixedPixelValue(ml) && isFixedPixelValue(mr)) {
        if (ml === mr) {
          style.marginLeft = 'auto';
          style.marginRight = 'auto';
          count += 1;
        } else {
          style.marginLeft = '0';
          style.marginRight = '0';
          count += 1;
        }
      } else if (isFixedPixelValue(ml)) {
        style.marginLeft = '0';
        count += 1;
      } else if (isFixedPixelValue(mr)) {
        style.marginRight = '0';
        count += 1;
      }
    });
    if (!count) return { html: input, changed: false, count: 0 };
    const serializer = new XMLSerializer();
    return { html: serializer.serializeToString(root), changed: true, count };
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
    if (!/\.html?$/i.test(file.name)) {
      setNotice({ kind: 'error', title: '文件格式不支持', detail: '请选择 .html 或 .htm 文件。' });
      return;
    }
    loadHtml(await file.text(), file.name);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void readFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void readFile(event.dataTransfer.files?.[0]);
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
      // 最终兜底：确保写进剪贴板的 HTML 不含 start/end 等非标准 text-align（微信规范 1.6）。
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

      // 最终兜底：响应式容器（规范 1.4）。解析产物 DOM，做 width+margin 清理，
      // 减少被公众号后台判定为“居中布局不一致 / 存在溢出问题”。
      const layoutFixed = rewriteResponsiveLayout(finalHtml);
      if (layoutFixed.changed) {
        finalHtml = layoutFixed.html;
        if (layoutFixed.count) result.fixes.push(`响应式布局 ×${layoutFixed.count}`);
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
            <Button variant="outline" size="lg" onClick={() => fileInputRef.current?.click()} className="hidden min-h-11 sm:inline-flex"><Icon name="upload" />导入 HTML</Button>
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
            className={`rounded-2xl border border-dashed p-4 transition-colors ${isDragging ? 'border-[#b28a2f] bg-[#fbf7ec]' : 'bg-card'}`}
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <Icon name="upload" className="mb-3 size-5 text-[#9a7626]" />
            <p className="text-sm font-semibold">拖入 HTML 文件</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">也可以点击顶部“导入 HTML”。文章不会上传。</p>
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
                点“复制到公众号”时会自动处理：文字对齐 start/end、自定义字体 font-family、<code>!important</code>、大固定宽度、行高叠字等，粘贴后再校验一般不会重复提示。
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
