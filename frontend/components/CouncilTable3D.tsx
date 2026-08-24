"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import Image from "next/image";
import { type CSSProperties, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { fullCharacterForSeat, roleArtifactFor } from "@/lib/portraits";
import type { LogType, Role } from "@/lib/types";

export interface CouncilPlayer {
  seatId: string;
  name: string;
  alive: boolean;
  role: Role | null;
  you: boolean;
}

export interface CouncilEvent {
  type: LogType;
  seatId: string | null;
  target: string | null;
}

export type CouncilCameraMode = "immersive" | "cinematic" | "map";

type SceneStyle = CSSProperties & {
  "--seat-x": string;
  "--seat-bottom": string;
  "--seat-scale": string;
  "--seat-depth": string;
  "--seat-delay": string;
};

type ParticleStyle = CSSProperties & {
  "--particle-x": string;
  "--particle-y": string;
  "--particle-delay": string;
  "--particle-size": string;
};

const SEAT_LAYOUT = [
  { x: 50, bottom: -13, scale: 1.52, depth: 8 },
  { x: 7, bottom: -9, scale: 1.3, depth: 6 },
  { x: 21, bottom: -1, scale: 1.1, depth: 4 },
  { x: 37, bottom: 4, scale: .96, depth: 2 },
  { x: 63, bottom: 4, scale: .96, depth: 2 },
  { x: 79, bottom: -1, scale: 1.1, depth: 4 },
  { x: 93, bottom: -9, scale: 1.3, depth: 6 },
];

function seededValue(index: number, salt: number): number {
  return Math.abs(Math.sin(index * 91.17 + salt * 47.31) * 43758.5453) % 1;
}

function Fireflies({ reduceMotion }: { reduceMotion: boolean }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const values = new Float32Array(54 * 3);
    for (let index = 0; index < 54; index += 1) {
      values[index * 3] = (seededValue(index, 1) - .5) * 12;
      values[index * 3 + 1] = (seededValue(index, 2) - .2) * 6;
      values[index * 3 + 2] = seededValue(index, 3) * 3;
    }
    return values;
  }, []);

  useFrame(({ clock }) => {
    if (!points.current || reduceMotion) return;
    points.current.rotation.z = Math.sin(clock.elapsedTime * .08) * .045;
    points.current.position.y = Math.sin(clock.elapsedTime * .32) * .12;
  });

  return (
    <points ref={points} position={[0, 0, 0]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffc66d" size={.055} transparent opacity={.76} sizeAttenuation />
    </points>
  );
}

function EmberCloud({ reduceMotion }: { reduceMotion: boolean }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const values = new Float32Array(36 * 3);
    for (let index = 0; index < 36; index += 1) {
      values[index * 3] = (seededValue(index, 4) - .5) * 2.4;
      values[index * 3 + 1] = seededValue(index, 5) * 2.1 - 1.8;
      values[index * 3 + 2] = seededValue(index, 6) * 1.4;
    }
    return values;
  }, []);

  useFrame((_, delta) => {
    if (!points.current || reduceMotion) return;
    points.current.position.y += delta * .22;
    points.current.rotation.y += delta * .05;
    if (points.current.position.y > 1.2) points.current.position.y = -1;
  });

  return (
    <points ref={points} position={[0, -1, .4]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ff8b3d" size={.075} transparent opacity={.82} sizeAttenuation />
    </points>
  );
}

function JungleAtmosphere({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <Canvas
      className="jungle-atmosphere-canvas"
      camera={{ position: [0, 0, 7], fov: 48 }}
      dpr={[1, 1.35]}
      frameloop={reduceMotion ? "demand" : "always"}
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
    >
      <Fireflies reduceMotion={reduceMotion} />
      <EmberCloud reduceMotion={reduceMotion} />
    </Canvas>
  );
}

function CssAtmosphere() {
  return (
    <div className="jungle-css-atmosphere" aria-hidden="true">
      {Array.from({ length: 24 }, (_, index) => {
        const style: ParticleStyle = {
          "--particle-x": `${8 + seededValue(index, 7) * 84}%`,
          "--particle-y": `${22 + seededValue(index, 8) * 64}%`,
          "--particle-delay": `${seededValue(index, 9) * -8}s`,
          "--particle-size": `${2 + seededValue(index, 10) * 3}px`,
        };
        return <span key={index} style={style} />;
      })}
    </div>
  );
}

function sceneStyle(index: number): SceneStyle {
  const seat = SEAT_LAYOUT[index % SEAT_LAYOUT.length];
  return {
    "--seat-x": `${seat.x}%`,
    "--seat-bottom": `${seat.bottom}%`,
    "--seat-scale": `${seat.scale}`,
    "--seat-depth": `${seat.depth}`,
    "--seat-delay": `${index * -.73}s`,
  };
}

function agentStateLabel(player: CouncilPlayer, active: boolean, targeted: boolean): string {
  if (!player.alive) return "Fallen";
  if (active) return "Speaking now";
  if (targeted) return "Under accusation";
  if (player.you) return "Your place in the circle";
  return "Listening";
}

function VillageCharacter({
  player,
  index,
  active,
  targeted,
  selected,
  hiddenFromSeat,
  onSelect,
}: {
  player: CouncilPlayer;
  index: number;
  active: boolean;
  targeted: boolean;
  selected: boolean;
  hiddenFromSeat: boolean;
  onSelect: () => void;
}) {
  const character = fullCharacterForSeat(player.seatId);
  if (!character) return null;

  return (
    <button
      type="button"
      className={[
        "jungle-character",
        active ? "is-speaking" : "",
        targeted ? "is-targeted" : "",
        selected ? "is-selected" : "",
        player.alive ? "" : "is-fallen",
        player.you ? "is-human" : "is-agent",
        hiddenFromSeat ? "is-seat-hidden" : "",
      ].filter(Boolean).join(" ")}
      style={sceneStyle(index)}
      aria-label={`${player.name}. ${agentStateLabel(player, active, targeted)}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="jungle-character-name">
        <strong>{player.name}</strong>
        <small>{agentStateLabel(player, active, targeted)}</small>
      </span>
      <span className="jungle-character-aura" aria-hidden="true" />
      <span className="jungle-character-figure">
        <Image
          src={character}
          alt=""
          fill
          priority={index < 4}
          sizes="(max-width: 720px) 40vw, 20vw"
        />
      </span>
      {player.role ? (
        <span className={`jungle-role-reveal role-${player.role}`}>
          <Image src={roleArtifactFor(player.role)} width={30} height={30} alt="" />
          <span>{player.role}</span>
        </span>
      ) : null}
      {targeted ? <span className="jungle-accusation-mark" aria-hidden="true">!</span> : null}
    </button>
  );
}

export function CouncilTable3D({
  players,
  activeSeatId,
  phase,
  event,
  cameraMode,
}: {
  players: CouncilPlayer[];
  activeSeatId: string | null;
  phase: string;
  event: CouncilEvent | null;
  cameraMode: CouncilCameraMode;
}) {
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [webglSupported] = useState(() => {
    if (typeof document === "undefined") return false;
    try {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
      return false;
    }
  });
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
  const human = players.find((player) => player.you);
  const target = event?.target ?? null;
  const focusSeatId = selectedSeatId ?? activeSeatId;
  const focusPlayer = players.find((player) => player.seatId === focusSeatId) ?? null;
  const isNight = phase === "night" || phase === "lobby";

  const handlePointerMove = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion) return;
    const bounds = pointerEvent.currentTarget.getBoundingClientRect();
    const x = (pointerEvent.clientX - bounds.left) / bounds.width - .5;
    const y = (pointerEvent.clientY - bounds.top) / bounds.height - .5;
    pointerEvent.currentTarget.style.setProperty("--look-x", `${x * -14}px`);
    pointerEvent.currentTarget.style.setProperty("--look-y", `${y * -8}px`);
    pointerEvent.currentTarget.style.setProperty("--cast-look-x", `${x * 4}px`);
    pointerEvent.currentTarget.style.setProperty("--cast-look-y", `${y * 2}px`);
  };

  return (
    <div
      className={`living-village-renderer is-jungle-village ${isNight ? "is-night" : "is-day"}`}
      data-camera={cameraMode}
      onPointerMove={handlePointerMove}
      onPointerLeave={(pointerEvent) => {
        pointerEvent.currentTarget.style.setProperty("--look-x", "0px");
        pointerEvent.currentTarget.style.setProperty("--look-y", "0px");
        pointerEvent.currentTarget.style.setProperty("--cast-look-x", "0px");
        pointerEvent.currentTarget.style.setProperty("--cast-look-y", "0px");
      }}
    >
      <div className="jungle-scene-background" aria-hidden="true">
        <Image
          src="/scenes/jungle-council.webp"
          alt=""
          fill
          priority
          sizes="100vw"
        />
      </div>
      <div className="jungle-canopy-shadow" aria-hidden="true" />
      <div className="jungle-ground-mist mist-one" aria-hidden="true" />
      <div className="jungle-ground-mist mist-two" aria-hidden="true" />
      {webglSupported ? <JungleAtmosphere reduceMotion={reduceMotion} /> : <CssAtmosphere />}

      <div className="jungle-cast" aria-label="The villagers gathered in the jungle clearing">
        {players.map((player, index) => (
          <VillageCharacter
            key={player.seatId}
            player={player}
            index={index}
            active={player.seatId === activeSeatId}
            targeted={Boolean(target && (target === player.seatId || target === player.name))}
            selected={player.seatId === selectedSeatId}
            hiddenFromSeat={player.you}
            onSelect={() => setSelectedSeatId((current) => current === player.seatId ? null : player.seatId)}
          />
        ))}
      </div>

      <div className="jungle-fire-glow" aria-hidden="true" />
      <div className="jungle-foreground" aria-hidden="true" />

      <div className="council-presence-hud" aria-live="polite">
        <span>
          {cameraMode === "immersive" && human
            ? `IN THE CLEARING · ${human.name.toUpperCase()}`
            : cameraMode === "cinematic"
              ? "AGENT FOCUS"
              : "THE WHOLE VILLAGE"}
        </span>
        <small>
          {focusPlayer
            ? `${focusPlayer.name} ${focusPlayer.seatId === activeSeatId ? "is speaking" : "is in focus"}`
            : "Six AI villagers wait for someone to break the silence"}
        </small>
      </div>

      <div className="council-accessible-cast" aria-label="Choose a villager to focus">
        {players.map((player) => (
          <button
            key={player.seatId}
            type="button"
            className={player.seatId === focusSeatId ? "is-active" : ""}
            onClick={() => setSelectedSeatId((current) => current === player.seatId ? null : player.seatId)}
          >
            {player.name}{player.you ? " · you" : ""}{!player.alive ? " · fallen" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}
