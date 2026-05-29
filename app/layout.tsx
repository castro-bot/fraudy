import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fraudy — Detección de Fraude en Siniestros | Aseguradora del Sur",
  description:
    "Sistema de análisis de posibles fraudes en siniestros de seguros. Score híbrido con reglas, ML e IA generativa.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased dark`}>
      <body className="min-h-full flex bg-background text-foreground">
        <SidebarProvider>
          <AppSidebar />
          <div className="flex flex-1 flex-col min-w-0">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] px-4">
              <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
              <div className="h-4 w-px bg-white/[0.08]" />
              <span className="text-xs text-muted-foreground">
                Fraudy · Aseguradora del Sur
              </span>
            </header>
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
        </SidebarProvider>
      </body>
    </html>
  );
}
