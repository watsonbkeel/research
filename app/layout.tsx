import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "开题证据台",
  description: "澳大利亚博士开题研究与证据工作台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
