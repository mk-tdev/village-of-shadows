"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import styles from "./exploration.module.css";

const Experience = dynamic(() => import("./ExplorationExperience"), {
  ssr: false,
  loading: () => <main className={styles.loading}><span className={styles.loadingMark}>◈</span><p>Lighting the way…</p><Link href="/setup">Go to the council</Link></main>,
});

export default function ExplorationLoader() { return <Experience />; }
