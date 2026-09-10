# 公众号排版助手

一个完全在本机运行的 HTML 中转编辑器。它不会上传文章，也不需要登录。

## 打开方式

### 直接使用（推荐，零依赖）

双击 `dist\index.html`。

- **不需要安装 Node.js**，不需要联网，不需要命令行
- 整个应用（界面、样式、全部逻辑）都在一个约 320 KB 的 HTML 文件里
- 可以直接拷到 U 盘或发给别人，双击就能打开
- 修改源码后执行 `npm run build` 重新生成

### 开发模式（需要 Node.js 20.19+）

```powershell
npm install
npm run dev
```

然后访问 `http://localhost:13580/`。适合改代码时使用，支持热更新。

## 使用步骤

1. 把 AI 生成的 `.html` 文件拖进左侧的“拖入 HTML 文件”区域，或点击该区域选择文件（仅支持 `.html` / `.htm`）。
2. 在“预览编辑”中直接修改文字；需要时可以使用加粗、斜体和对齐工具。
3. 点击“复制到公众号”。
4. 打开微信公众号后台的图文编辑器，直接粘贴。

## 注意事项

- 图片应使用公开可访问的 `https://` 地址。相对路径、`file://` 和临时 `blob:` 图片无法跟随文章进入公众号。
- 工具会移除脚本、表单、iframe 等公众号不需要的内容，并把主要 CSS 转换为行内样式。
- 内置微信规范检查：会检查内容溢出、文字挤压、异常行高/高度、自定义字体、`!important`、`span[leaf]`、`section[nodeleaf]`、SVG 点击事件和深色模式常见问题。
- **宽度保真优先**：固定像素宽度**不再被改写**，而是保留原尺寸并自动追加官方豁免属性 `data-ignore-width`，让公众号后台放行。这样本地预览与公众号渲染保持一致。
- 自动修正的项目：透明光标、异常叠字行高、普通正文 `<pre>`、SVG 点击事件、`start`/`end` 对齐转换、渐变/低对比度的深色模式豁免标记。
- 支持展开 Flex/Grid、定位、阴影、滤镜、列表、表格、文字效果等样式，并把 `::before` / `::after` 装饰转换成可复制的真实元素。
- **两条复制路径要一致**：在预览区手动全选复制、或点「复制到公众号」按钮，得到的样式应当一致。详见下方〈关于两条复制路径〉。
- 草稿自动保存在当前浏览器中；清除浏览器网站数据会同时清除草稿，请及时导出重要文章。
- 单文件版在 `file://` 下打开时，部分浏览器会禁用本地存储，此时编辑与复制仍可用，只是不会自动保存草稿。若需自动保存，请用开发模式（`http://localhost`）打开。

### 关于两条复制路径

有两条路可以把文章送进公众号，它们的产物**必须一致**：

1. **手动全选复制** —— 在预览区 `Ctrl/Cmd+A`、`Ctrl/Cmd+C`。浏览器直接把作者写在 `style=""` 里的原样声明放进剪贴板，所见即所得。
2. **点「复制到公众号」按钮** —— 会经过本工具的清洗管线，追加官方豁免属性、做标签与对齐归一化。

按钮路径为了处理继承样式、`margin:auto`、伪元素等，必须读取 `getComputedStyle`（浏览器解析后的计算值）。但计算值会暴露大量**隐含推断**，如果不加约束地写进产物，就会出现「按钮复制反而比手动全选复制更容易出样式错」——这正是本项目修复过的一类真实问题：

| 污染类型 | 表现 | 处理 |
| --- | --- | --- |
| `border-*-color` | 默认值为 `currentColor`，会跟着 `color` **凭空造出 4 条边框色**，粘到公众号可能真的画出边框 | 除非作者显式写过边框，否则不写入 |
| 简写被展开 | `background:#faf7ef` → `none 0% 0% / auto repeat padding-box border-box rgb(...)` | 回填作者写在 `style` 里的**字面原文** |
| 倍数行高被换算 | `line-height:1.8` → `28.8px`，不随字号缩放，行距会跑偏 | 还原为倍数写法（含沿祖先链继承的情况） |
| 行高误判 | 无单位的 `1.8` 被当成 px 与字号比较，`1.8 < 16` 判为「叠字」，强行改成 `1.5` | 只对带 `px` 单位的行高做叠字检查 |

> 结论：工具会同时提供两条路径且保证一致；若你发现某个样式在按钮复制后变了样，欢迎提 issue，那属于需要修的一致性缺陷。

### 官方豁免属性

公众号官方提供了三个「豁免」属性，标记后后台的校验与深色模式算法会跳过对应检查（官方规范 1.4.4 / 4.5.1 / 4.6）。本工具会自动补齐，你也可以手写在 HTML 里。

| 属性 | 作用 | 生效范围 |
| --- | --- | --- |
| `data-ignore-width` | 跳过宽度 / 居中 / 溢出检测，固定像素宽度保持原样 | **该元素及其整个子树** |
| `data-ignore-dm="low-contrast"` | 跳过「文字与背景对比度过低」检测 | **仅当前节点**（后代仍会被检测） |
| `data-ignore-dm="text-bg-gradient"` | 跳过「文字背景使用渐变」检测 | **仅当前节点** |
| `data-no-dark` | 当前节点跳过深色模式算法转换 | **仅当前节点** |

`data-ignore-dm` 的值可以多选，用空格分隔，例如 `data-ignore-dm="low-contrast text-bg-gradient"`。

工具的自动行为：

- 任何写了固定 `px` 宽度的元素 → 自动追加 `data-ignore-width`
- 文字叠加在渐变背景上 → 自动追加 `data-ignore-dm="text-bg-gradient"`
- 文字与背景对比度低于 3:1（WCAG 静态推算）→ 自动追加 `data-ignore-dm="low-contrast"`

手写示例：

```html
<!-- 这个 900px 宽的卡片是刻意设计的，不要被改掉 -->
<section data-ignore-width style="width:900px;">…</section>

<!-- 这个渐变块希望深色模式下保持原样 -->
<section data-ignore-dm="text-bg-gradient" style="background:linear-gradient(90deg,#faa,#afa);">…</section>
```

注意：`data-ignore-width` 是子树级豁免，父元素标记后所有后代都会跳过宽度检测；`data-ignore-dm` 和 `data-no-dark` 只作用于标记的那个节点，父子需各自标记。

### 关于 text-align

- `start` / `end` 是官方规范（1.6）明确列出的**错误值**，不同终端兼容性有差异（部分设备居中、部分居左），复制时自动转为等价的 `left` / `right`。
- `justify`（两端对齐）等值**不在**官方错误名单里，**原样保留**，同时把值镜像到 HTML `align` 属性上，提高跨端解析一致性。

### 刻意不做的事

公众号生态里流传着一些第三方工具自造的属性（如 `data-darkmode-bgcolor`、`<style class="darkmode">`），**未见于官方规范与官方算法**。官方深色模式算法只读取内联 `style`，不读取这些标记。本工具不生成它们。

## 技术栈

纯前端单页应用，全部逻辑在浏览器中运行，没有任何后端服务。

| 用途 | 选型 |
| --- | --- |
| 构建工具 | Vite 8 |
| UI 框架 | React 19（TypeScript） |
| 样式 | Tailwind CSS 4（`@tailwindcss/vite` 插件） |
| 组件基础 | Base UI（`@base-ui/react`） |
| 工具函数 | class-variance-authority、clsx、tailwind-merge |
| 单文件打包 | vite-plugin-singlefile（构建时把 JS/CSS 全部内联） |

## 目录结构

```
index.html                     页面入口（图标已内联为 data URI）
vite.config.ts                 构建与开发服务器配置（dev 端口 13580）
src/
  main.tsx                     挂载 React 应用
  App.tsx                      编辑器全部业务逻辑（导入、清洗、内联样式、规范检查、复制）
  index.css                    Tailwind 主题与自定义变体
  lib/utils.ts                 cn() 类名合并工具
  components/ui/               实际用到的 4 个 UI 组件（Alert / Button / Tabs / Textarea）
dist/
  index.html                   单文件产物，双击即用
```

## 常用命令

```powershell
npm install         # 首次准备（仅开发模式需要）
npm run dev         # 开发服务器 http://localhost:13580/
npm run build       # 构建单文件产物到 dist/
npm run typecheck   # TypeScript 类型检查
npm run verify      # 产物结构断言（无需浏览器，会随 build 一起回归）
npm run verify:parity  # 「按钮复制 vs 手动全选复制」产物一致性回归（需 playwright，未装则自动跳过）
```

## 打不开怎么办

- 单文件版：确认 `dist\index.html` 存在；不存在就先执行一次 `npm run build`。
- 开发模式：执行 `npm run dev` 后，命令窗口会输出本地地址；请保持该窗口打开，关闭即停止服务。
- 单文件版在 `file://` 下打开时，部分浏览器会禁用本地存储，此时编辑与复制仍可用，只是不会自动保存草稿。
