import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

/* Fontes servidas pelo próprio app (next/font baixa no build). Antes vinham
   de fonts.googleapis.com: duas conexões a mais e um CSS que travava a
   primeira pintura — no 4G, fácil meio segundo antes de aparecer qualquer
   coisa. As variáveis alimentam --font-* em globals.css. */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-bricolage",
  display: "swap",
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
  // Três arquivos; pré-carregar todos disputaria banda com o que importa
  // na primeira pintura. O fallback já tem métrica ajustada.
  preload: false,
});

export const metadata: Metadata = {
  title: "RumoFácil",
  description:
    "Renda, gastos e investimentos, seus e de quem divide a vida com você.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RumoFácil",
  },
};

export const viewport: Viewport = {
  themeColor: "#101219",
  width: "device-width",
  initialScale: 1,
  // Instalado na tela de início, ele tem que se comportar como app: um gesto
  // torto não pode dar zoom e deixar a tela torta até você arrumar na mão.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
