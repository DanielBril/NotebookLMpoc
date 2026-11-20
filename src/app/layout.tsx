import type { Metadata } from "next";
import { Heebo, Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ContextLM — מענה חכם ומבוסס ממסמכים",
  description:
    "העלו עד 10 מסמכים ושאלו שאלות מבוססות מקורות בלבד עם הפניות ישירות, תגובה מהירה בזמן אמת והגנת 4 שכבות מפני הזרקת פרומפטים.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="ltr"
      suppressHydrationWarning
      className={`${heebo.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#f2fafb] text-[#253237] flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
