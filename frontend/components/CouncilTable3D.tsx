"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useMemo, useRef, useState } from "react";
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

export type CouncilCameraMode = "cinematic" | "map";

const CINEMATIC_POSITIONS: [number, number, number][] = [
  [-3.45, 0, -0.2],
  [-2.35, 0, 0.2],
  [-1.18, 0, 0.43],
  [0, 0, 0.52],
  [1.18, 0, 0.43],
  [2.35, 0, 0.2],
  [3.45, 0, -0.2],
];

function seatPosition(index: number, count: number, mode: CouncilCameraMode): THREE.Vector3 {
  if (mode === "cinematic") {
    const position = CINEMATIC_POSITIONS[index] ?? [((index - (count - 1) / 2) * 1.1), 0, 0];
    return new THREE.Vector3(...position);
  }
  const angle = (index / count) * Math.PI * 2 + Math.PI;
  return new THREE.Vector3(Math.sin(angle) * 2.65, 0, Math.cos(angle) * 2.65);
}

function CameraDirector({
  players,
  focusSeatId,
  mode,
  reduceMotion,
}: {
  players: CouncilPlayer[];
  focusSeatId: string | null;
  mode: CouncilCameraMode;
  reduceMotion: boolean;
}) {
  const { camera } = useThree();
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const focusIndex = players.findIndex((player) => player.seatId === focusSeatId);
    if (mode === "map") {
      targetPosition.set(0, 8.7, 5.2);
      lookTarget.set(0, 0, 0);
    } else if (focusIndex >= 0) {
      const focus = seatPosition(focusIndex, players.length, mode);
      targetPosition.set(focus.x * 0.18, 3.15, 7.25);
      lookTarget.set(focus.x * 0.28, 1.25, focus.z);
    } else {
      targetPosition.set(0, 3.35, 8.25);
      lookTarget.set(0, 1.05, 0);
    }

    const ease = reduceMotion ? 1 : 1 - Math.exp(-delta * 2.2);
    camera.position.lerp(targetPosition, ease);
    camera.lookAt(lookTarget);
  });

  return null;
}

function Backdrop() {
  const texture = useLoader(THREE.TextureLoader, "/scenes/moonlit-village.png");
  const prepared = useMemo(() => {
    const clone = texture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.anisotropy = 4;
    clone.needsUpdate = true;
    return clone;
  }, [texture]);

  return (
    <mesh position={[0, 3.1, -4.9]}>
      <planeGeometry args={[13.4, 7.54]} />
      <meshBasicMaterial map={prepared} toneMapped={false} fog={false} />
    </mesh>
  );
}

function Bonfire({ phase, active, reduceMotion }: { phase: string; active: boolean; reduceMotion: boolean }) {
  const fire = useRef<THREE.Group>(null);
  const isNight = phase === "night" || phase === "lobby";

  useFrame(({ clock }) => {
    if (!fire.current || reduceMotion) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 7.3) * 0.11 + Math.sin(clock.elapsedTime * 12.1) * 0.05;
    fire.current.scale.set(pulse, 0.9 + pulse * 0.1, pulse);
  });

  return (
    <group position={[0, 0, 1.05]}>
      {[0, 1, 2].map((log) => (
        <mesh key={log} position={[0, 0.12, 0]} rotation={[Math.PI / 2, (Math.PI / 3) * log, 0]}>
          <cylinderGeometry args={[0.07, 0.09, 0.78, 8]} />
          <meshStandardMaterial color="#39211b" roughness={1} />
        </mesh>
      ))}
      <group ref={fire} position={[0, 0.44, 0]}>
        <mesh>
          <coneGeometry args={[0.26, 0.72, 12]} />
          <meshBasicMaterial color={active ? "#ff7350" : "#ef9b48"} transparent opacity={0.86} />
        </mesh>
        <mesh position={[0, -0.12, 0.05]}>
          <coneGeometry args={[0.17, 0.42, 12]} />
          <meshBasicMaterial color="#fff1a8" transparent opacity={0.92} />
        </mesh>
      </group>
      <pointLight position={[0, 0.75, 0.15]} intensity={isNight ? 6.2 : 3.2} distance={6.5} color="#e66d38" />
    </group>
  );
}

function FogVeil({ reduceMotion }: { reduceMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  const wisps = useMemo(
    () => Array.from({ length: 9 }, (_, index) => ({
      x: -4.7 + ((index * 31) % 90) / 10,
      z: -0.8 + ((index * 47) % 42) / 10,
      scale: 1.4 + ((index * 13) % 20) / 10,
    })),
    []
  );

  useFrame(({ clock }) => {
    if (!group.current || reduceMotion) return;
    group.current.position.x = Math.sin(clock.elapsedTime * 0.09) * 1.2;
  });

  return (
    <group ref={group}>
      {wisps.map((wisp, index) => (
        <mesh key={index} position={[wisp.x, 0.11, wisp.z]} rotation={[-Math.PI / 2, 0, index * 0.31]} scale={[wisp.scale, 0.35, 1]}>
          <circleGeometry args={[1, 32]} />
          <meshBasicMaterial color="#a8afc3" transparent opacity={0.035} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Scene({
  players,
  activeSeatId,
  phase,
  mode,
  reduceMotion,
}: {
  players: CouncilPlayer[];
  activeSeatId: string | null;
  phase: string;
  mode: CouncilCameraMode;
  reduceMotion: boolean;
}) {
  const isNight = phase === "night" || phase === "lobby";

  return (
    <>
      <CameraDirector players={players} focusSeatId={activeSeatId} mode={mode} reduceMotion={reduceMotion} />
      <fog attach="fog" args={[isNight ? "#080d18" : "#21140c", 8, 18]} />
      <ambientLight intensity={isNight ? 0.32 : 0.66} color={isNight ? "#8096c8" : "#ffd7a0"} />
      <directionalLight position={[-4, 8, 3]} intensity={isNight ? 1.55 : 2.3} color={isNight ? "#aebfe8" : "#ffc47a"} />
      <Backdrop />

      <mesh receiveShadow position={[0, -0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[8, 64]} />
        <meshStandardMaterial color={isNight ? "#11151b" : "#2d2117"} roughness={0.96} metalness={0.04} />
      </mesh>
      <mesh position={[0, -0.065, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.15, 3.9, 64]} />
        <meshStandardMaterial color="#252127" roughness={1} transparent opacity={0.72} />
      </mesh>
      <Bonfire phase={phase} active={activeSeatId !== null} reduceMotion={reduceMotion} />
      <FogVeil reduceMotion={reduceMotion} />

    </>
  );
}

function castPosition(index: number, count: number, mode: CouncilCameraMode) {
  if (mode === "cinematic") {
    return { left: `${10 + (index / Math.max(1, count - 1)) * 80}%`, bottom: "2.5%" };
  }
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  return {
    left: `${50 + Math.cos(angle) * 34}%`,
    bottom: `${31 - Math.sin(angle) * 19}%`,
  };
}

function CinematicCast({
  players,
  activeSeatId,
  event,
  mode,
}: {
  players: CouncilPlayer[];
  activeSeatId: string | null;
  event: CouncilEvent | null;
  mode: CouncilCameraMode;
}) {
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const focusedSeatId = activeSeatId ?? selectedSeatId;
  const voterIndex = event?.seatId ? players.findIndex((player) => player.seatId === event.seatId) : -1;
  const targetIndex = event?.target ? players.findIndex((player) => player.name === event.target) : -1;
  const voter = voterIndex >= 0 ? castPosition(voterIndex, players.length, mode) : null;
  const target = targetIndex >= 0 ? castPosition(targetIndex, players.length, mode) : null;

  return (
    <div className={`cinematic-cast cinematic-cast-${mode}`} aria-label="Village characters">
      {event?.type === "vote" && voter && target && (
        <svg className="cast-vote-line" aria-hidden="true">
          <line x1={voter.left} y1={`calc(100% - ${voter.bottom})`} x2={target.left} y2={`calc(100% - ${target.bottom})`} />
        </svg>
      )}
      {players.map((player, index) => {
        const active = activeSeatId === player.seatId;
        const selected = selectedSeatId === player.seatId && !activeSeatId;
        const dimmed = Boolean(focusedSeatId && focusedSeatId !== player.seatId);
        const position = castPosition(index, players.length, mode);
        return (
          <button
            key={player.seatId}
            type="button"
            className={`cinematic-person${active ? " is-speaking" : ""}${selected ? " is-selected" : ""}${!player.alive ? " is-dead" : ""}${dimmed ? " is-dimmed" : ""}`}
            style={{ left: position.left, bottom: position.bottom, zIndex: mode === "map" ? 20 + index : 20 + Math.abs(3 - index) }}
            onClick={() => setSelectedSeatId((current) => current === player.seatId ? null : player.seatId)}
            aria-label={`${player.name}${active ? ", speaking" : ""}${!player.alive ? ", eliminated" : ""}`}
          >
            <span className="cinematic-name">
              {player.you && <b>YOU</b>}
              {player.name}
            </span>
            <span className="cinematic-figure-wrap">
              {/* Generated as one coherent full-body portrait rather than a face
                  pasted onto procedural geometry. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fullCharacterForSeat(player.seatId) ?? "/characters/full/mara.webp"} alt="" draggable={false} />
            </span>
            {player.role && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="cinematic-role" src={roleArtifactFor(player.role)} alt={player.role} />
            )}
            {!player.alive && <span className="cinematic-memorial">IN MEMORY</span>}
          </button>
        );
      })}
    </div>
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
  const [webglSupported] = useState(() => {
    if (typeof document === "undefined") return true;
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  });
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  if (!webglSupported) {
    return (
      <div className="living-village-renderer">
        <CinematicCast players={players} activeSeatId={activeSeatId} event={event} mode={cameraMode} />
      </div>
    );
  }

  return (
    <div className="living-village-renderer">
      <Canvas
        shadows
        dpr={[1, 1.45]}
        frameloop={reduceMotion ? "demand" : "always"}
        camera={{ position: [0, 3.35, 8.25], fov: 42, near: 0.1, far: 32 }}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      >
        <Suspense fallback={null}>
          <Scene players={players} activeSeatId={activeSeatId} phase={phase} mode={cameraMode} reduceMotion={reduceMotion} />
        </Suspense>
      </Canvas>
      <CinematicCast players={players} activeSeatId={activeSeatId} event={event} mode={cameraMode} />
    </div>
  );
}
