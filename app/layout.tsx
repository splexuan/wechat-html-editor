import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '公众号排版助手',
  description: '本地导入、编辑并复制公众号兼容 HTML，无需登录。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
