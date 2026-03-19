import type { Metadata } from "next";
import { Geist_Mono, Red_Hat_Display } from "next/font/google";
import "./globals.css";

const redHat = Red_Hat_Display({
  variable: "--font-red-hat",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "НМИЦ ИТ - статистическая платформа",
  description: "Админка статистического сервиса для региональных форм и метрик",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${redHat.variable} ${geistMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
