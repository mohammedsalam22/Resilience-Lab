import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Resilience Lab",
    template: "%s · Resilience Lab",
  },
  description:
    "Live, server-driven simulations of load balancing and fault tolerance patterns.",
};

// Runs before first paint so a stored dark preference never flashes light.
const themeInit = `try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable} min-h-screen font-sans antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <div className="mx-auto w-full max-w-3xl px-6 py-8">
          <header className="mb-12 flex items-center justify-between">
            <Link href="/" className="font-display text-lg tracking-tight">
              Resilience Lab
            </Link>
            <nav className="flex items-center gap-4">
              <Link href="/learn" className="text-sm text-muted transition-colors hover:text-text">
                Learn
              </Link>
              <ThemeToggle />
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
