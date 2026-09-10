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
- 内置微信规范检查：会检查固定宽度、内容溢出、异常行高/高度、自定义字体、`!important`、`span[leaf]`、`section[nodeleaf]`、SVG 点击事件和深色模式常见问题。
- 导出采用“样式保真优先”：保留字体、`!important`、固定尺寸与复杂布局，同时对微信规范风险给出提示；只自动修正透明光标、异常叠字行高、普通正文 `<pre>` 与 SVG 点击兼容问题。
- 支持展开 Flex/Grid、定位、阴影、滤镜、列表、表格、文字效果等样式，并把 `::before` / `::after` 装饰转换成可复制的真实元素。
- 草稿自动保存在当前浏览器中；清除浏览器网站数据会同时清除草稿，请及时导出重要文章。
- 单文件版在 `file://` 下打开时，部分浏览器会禁用本地存储，此时编辑与复制仍可用，只是不会自动保存草稿。若需自动保存，请用开发模式（`http://localhost`）打开。

### 官方豁免属性

有些设计确实需要固定尺寸或渐变背景，此时可以在 HTML 里给对应元素加上公众号官方认可的“豁免”属性，后台算法会跳过相应检查，本工具同样会放行（不提示、不修改，并原样把属性带进剪贴板）：

| 属性 | 作用 | 生效范围 |
| --- | --- | --- |
| `data-ignore-width` | 跳过宽度 / 居中 / 溢出相关检查，固定像素宽度保持原样 | 该元素及其整个子树 |
| `data-ignore-dm` | 跳过深色模式对配色的自动改写 | 该元素及其整个子树 |
| `data-no-dark` | 同上，阻止深色模式下对该区域的自动转换 | 该元素及其整个子树 |

用法就是加在元素上，值可省略：

```html
<!-- 这个 900px 宽的卡片是刻意设计的，不要被改成 max-width -->
<section data-ignore-width style="width:900px;">…</section>

<!-- 这个渐变块希望深色模式下保持原样 -->
<section data-ignore-dm style="background:linear-gradient(90deg,#faa,#afa);">…</section>
```

注意：豁免是“作者显式声明”，加了就不再有该维度的保护提示 —— 窄屏（约 375px）下确实会横向溢出的，请自行确认可接受。

### 关于 text-align

- `start` / `end` 是官方规范（#2.6）明确列出的**非标准值**，中文终端会退化成左/右对齐，复制时自动转为 `left` / `right`。
- `justify`（两端对齐）**不在**官方非标准值名单里，被移除的原因是各端渲染不一致：iOS 会真两端对齐，安卓与微信编辑器常退化为左对齐，中文正文还会出现标点挤压、字距被拉开的空隙。中文正文极少需要它，因此统一移除改用默认左对齐。

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
```

## 打不开怎么办

- 单文件版：确认 `dist\index.html` 存在；不存在就先执行一次 `npm run build`。
- 开发模式：执行 `npm run dev` 后，命令窗口会输出本地地址；请保持该窗口打开，关闭即停止服务。
- 单文件版在 `file://` 下打开时，部分浏览器会禁用本地存储，此时编辑与复制仍可用，只是不会自动保存草稿。
