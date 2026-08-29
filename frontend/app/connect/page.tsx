import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MoonIcon } from "@/components/icons";
import styles from "./connect.module.css";

const GITHUB_URL = "https://github.com/mk-tdev/village-of-shadows";
const LINKEDIN_URL = "https://www.linkedin.com/in/muthukumar-dev/";

// Error-correction level H, encoded once from GITHUB_URL. Keeping the matrix
// in the page makes the finale presentation-safe: the QR does not depend on a
// third-party image endpoint or a working venue connection to render.
const QR_MODULES = [
  "11111110000101000000111010011000001111111",
  "10000010100101101011001100001011001000001",
  "10111010001000001101010011000110101011101",
  "10111010010101001000001110101101001011101",
  "10111010010010100000111010111000001011101",
  "10000010100001110101011100100101101000001",
  "11111110101010101010101010101010101111111",
  "00000000111111100101111001000110100000000",
  "00001111001001001000110110000101101100010",
  "10011001101010010110101001011010001011000",
  "01110110100111011001111010010110111000011",
  "01011101010111111001001101110101101001000",
  "00100110111110011001110000101100100000000",
  "00100001001100001010100011000011010111101",
  "10000010101010011011110000110001011011101",
  "11111000101001101000111001111111100011011",
  "00000110000001101010111011000100100101011",
  "01110100111100101001111001111110111110001",
  "11100010110010001100101100111010000100001",
  "10011100010111001100011001010001101101010",
  "10101011011010000011100001101001010011011",
  "00001001010000100000010001011110001100001",
  "01011011110110011100010000010100100110101",
  "11100001111100111111100011000110101011101",
  "10011111100101011111111100111100110001111",
  "01100001001011101100001101011000101110111",
  "00011111111110011000101100011110100010001",
  "00001000001110001010001000111111110001000",
  "01000010101110000001101101110100011000010",
  "10101100101111010010110100001101100010001",
  "00111111111101000000010100101100110001101",
  "00100001010111011001011010000100010011001",
  "11000110100100010010010111110101111111001",
  "00000000100010000101111111011011100011101",
  "11111110101100110011101011110101101011011",
  "10000010110110010000110110011111100011010",
  "10111010111011100010000001100011111111000",
  "10111010010110110111001010010000000101101",
  "10111010010101000010000100111111110001011",
  "10000010001111010000101111100100110100011",
  "11111110000111001110100100100101111110110",
] as const;

const QR_PATH = QR_MODULES.flatMap((row, y) =>
  Array.from(row, (module, x) => module === "1" ? `M${x} ${y}h1v1h-1z` : "")
).filter(Boolean).join("");

export const metadata: Metadata = {
  title: "Connect with Muthukumar | Village of Shadows",
  description: "Explore the source for Village of Shadows and connect with its creator, Muthukumar.",
};

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.29-5.27-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.19-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.41-2.71 5.39-5.29 5.68.42.36.79 1.06.79 2.15v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"
      />
    </svg>
  );
}

function LinkedinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5.37 7.97H1.02V22h4.35V7.97ZM3.19 1A2.53 2.53 0 1 0 3.2 6.05 2.53 2.53 0 0 0 3.19 1ZM22.98 13.96c0-4.22-2.25-6.18-5.26-6.18-2.42 0-3.51 1.33-4.11 2.27V7.97H9.26V22h4.35v-6.95c0-1.83.35-3.61 2.63-3.61 2.25 0 2.28 2.1 2.28 3.73V22h4.36l.1-8.04Z"
      />
    </svg>
  );
}

function GithubQr() {
  const size = QR_MODULES.length;

  return (
    <svg
      className={styles.qr}
      viewBox={`-4 -4 ${size + 8} ${size + 8}`}
      role="img"
      aria-label="QR code linking to the Village of Shadows GitHub repository"
      shapeRendering="crispEdges"
    >
      <rect x="-4" y="-4" width={size + 8} height={size + 8} fill="#fffdf4" />
      <path d={QR_PATH} fill="#050a0f" />
    </svg>
  );
}

export default function ConnectPage() {
  return (
    <main className={styles.page}>
      <Image
        className={styles.background}
        src="/scenes/moonlit-village.png"
        alt=""
        fill
        preload
        sizes="100vw"
      />
      <div className={styles.shade} />
      <div className={`${styles.fog} ${styles.fogOne}`} />
      <div className={`${styles.fog} ${styles.fogTwo}`} />
      <div className={styles.constellation} aria-hidden="true">
        <i /><i /><i /><i /><i /><i /><i />
      </div>

      <header className={styles.header}>
        <Link className={styles.mark} href="/" aria-label="Return to Village of Shadows">
          <span><MoonIcon /></span>
          <strong>VILLAGE OF SHADOWS</strong>
        </Link>
        <div className={styles.demoState}><i /> DEMO COMPLETE · CONNECTION OPEN</div>
      </header>

      <section className={styles.stage} aria-labelledby="connect-title">
        <div className={styles.copy}>
          <div className={styles.eyebrow}><span /> THE STORY CONTINUES IN THE OPEN</div>
          <h1 id="connect-title">
            The village fades.<br />
            <em>The connection remains.</em>
          </h1>
          <p className={styles.intro}>
            Explore the complete multi-agent system, trace its LangGraph architecture,
            and continue the conversation with the person behind the experiment.
          </p>

          <div className={styles.creator}>
            <div className={styles.monogram}>M</div>
            <div>
              <span>CREATED &amp; DEMONSTRATED BY</span>
              <h2>Muthukumar</h2>
              <p>Agentic AI builder · Human inside the graph</p>
            </div>
          </div>

          <div className={styles.links}>
            <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" className={styles.linkedin}>
              <LinkedinIcon />
              <span><small>CONNECT ON LINKEDIN</small>linkedin.com/in/muthukumar-dev</span>
              <b aria-hidden="true">↗</b>
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={styles.githubTextLink}>
              <GithubIcon />
              <span>github.com/mk-tdev/village-of-shadows</span>
            </a>
          </div>
        </div>

        <div className={styles.portal}>
          <div className={styles.orbit} aria-hidden="true">
            <span>LANGGRAPH</span>
            <span>MCP TOOLS</span>
            <span>MEMORY</span>
            <span>HUMAN</span>
          </div>
          <div className={styles.portalRing} aria-hidden="true" />
          <a
            className={styles.qrFrame}
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Open the Village of Shadows source code on GitHub"
          >
            <GithubQr />
            <span className={styles.scanLine} aria-hidden="true" />
          </a>
          <div className={styles.qrCaption}>
            <span><i /> SOURCE CODE · OPEN</span>
            <strong><GithubIcon /> Scan to enter the repository</strong>
            <small>github.com/mk-tdev/village-of-shadows</small>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Six AI agents · One human · One unscripted world</span>
        <span>Built with LangGraph · MCP · agent tools</span>
      </footer>
    </main>
  );
}
