import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MoonIcon } from "@/components/icons";
import styles from "../connect/connect.module.css";

const DEMO_URL = "https://village-of-shadows.vercel.app/";

// Error-correction level H, encoded once from DEMO_URL. The SVG path is
// self-contained, so a phone can scan it even without a QR image service.
const QR_MODULES = [
  "1111111010111101101100100110101111111",
  "1000001001011010110010110010001000001",
  "1011101011101110001001001010101011101",
  "1011101001101100000000110100101011101",
  "1011101010100001110000101110001011101",
  "1000001001000011011111011110101000001",
  "1111111010101010101010101010101111111",
  "0000000010110110001110101101100000000",
  "0000011000101001100010111010101010101",
  "1011000011110111100110110110100011000",
  "0010011111100100000100011111101001111",
  "1001000100110100010111100010001001011",
  "0000101111011011110000110001101001011",
  "1011000010100001100000111111110100100",
  "1001111100111110100000100011011111011",
  "0011110101110110010110011001011111101",
  "0000011100001001101011110111001010110",
  "1110010011100101011101001011100101100",
  "0111111010101000111100111011011001101",
  "1010010000100011011001001001110101000",
  "0111111000100011001110100110001111111",
  "1001000111000100101111001011100111100",
  "0101101100100000001101100001010001001",
  "1001100010000111010111010011010101001",
  "1110001011001111110001000110111001000",
  "1111110110000111110110101010101100000",
  "1011101101110111011110100110001000011",
  "1010010011111110101000101011010011101",
  "1010001010111101110010001110111110100",
  "0000000010010000100010010001100011000",
  "1111111001100100010101110010101011101",
  "1000001010010001010111100011100011011",
  "1011101001110110010111101111111110100",
  "1011101000000110111100000010001100100",
  "1011101000101011000000011100110100001",
  "1000001000001101101101010010110111001",
  "1111111000010011111110001000101001001",
] as const;

const QR_SIZE = QR_MODULES.length;
const QR_PATH = QR_MODULES.flatMap((row, y) =>
  Array.from(row, (module, x) => module === "1" ? `M${x} ${y}h1v1h-1z` : "")
).filter(Boolean).join("");

export const metadata: Metadata = {
  title: "Share the Village of Shadows Demo",
  description: "Scan a QR code to open the Village of Shadows interactive demo.",
};

function DemoQr() {
  return (
    <svg
      className={styles.qr}
      viewBox={`-4 -4 ${QR_SIZE + 8} ${QR_SIZE + 8}`}
      role="img"
      aria-label="QR code linking to the Village of Shadows demo"
      shapeRendering="crispEdges"
    >
      <rect x="-4" y="-4" width={QR_SIZE + 8} height={QR_SIZE + 8} fill="#fffdf4" />
      <path d={QR_PATH} fill="#050a0f" />
    </svg>
  );
}

export default function SharePage() {
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
        <div className={styles.demoState}><i /> LIVE DEMO · READY TO ENTER</div>
      </header>

      <section className={styles.stage} aria-labelledby="share-title">
        <div className={styles.copy}>
          <div className={styles.eyebrow}><span /> SHARE THE EXPERIMENT</div>
          <h1 id="share-title">
            The village is waiting.<br />
            <em>Bring someone with you.</em>
          </h1>
          <p className={styles.intro}>
            Scan the code to open the live Village of Shadows demo on a phone,
            then take a seat at the council and see what the agents believe.
          </p>

          <div className={styles.creator}>
            <div className={styles.monogram}><MoonIcon /></div>
            <div>
              <span>INTERACTIVE MULTI-AGENT DEMO</span>
              <h2>Enter the council</h2>
              <p>Six AI minds · one human · one unfolding story</p>
            </div>
          </div>

          <div className={styles.links}>
            <a href={DEMO_URL} target="_blank" rel="noreferrer" className={styles.linkedin}>
              <MoonIcon />
              <span><small>OPEN THE LIVE DEMO</small>village-of-shadows.vercel.app</span>
              <b aria-hidden="true">↗</b>
            </a>
            <Link href="/" className={styles.githubTextLink}>
              <span>Open the demo in this browser</span>
            </Link>
          </div>
        </div>

        <div className={styles.portal}>
          <div className={styles.orbit} aria-hidden="true">
            <span>LIVE DEMO</span>
            <span>SEVEN SEATS</span>
            <span>YOUR TURN</span>
            <span>SCAN TO JOIN</span>
          </div>
          <div className={styles.portalRing} aria-hidden="true" />
          <a className={styles.qrFrame} href={DEMO_URL} target="_blank" rel="noreferrer" aria-label="Open the live Village of Shadows demo">
            <DemoQr />
            <span className={styles.scanLine} aria-hidden="true" />
          </a>
          <div className={styles.qrCaption}>
            <span><i /> DEMO LINK · LIVE</span>
            <strong><MoonIcon /> Scan to enter the village</strong>
            <small>village-of-shadows.vercel.app</small>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Six AI agents · One human · One unscripted world</span>
        <span>Open the demo · Take a seat · Cast your vote</span>
      </footer>
    </main>
  );
}
