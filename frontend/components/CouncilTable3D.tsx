"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { portraitForSeat, roleArtifactFor } from "@/lib/portraits";
import type { LogType, Role } from "@/lib/types";

export interface CouncilPlayer {
  seatId: string;
  name: string;
  alive: boolean;
  role: Role | null;
  human: boolean;
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

function Nameplate({ name, active, alive, human }: { name: string; active: boolean; alive: boolean; human: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 144;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.fillStyle = active ? "rgba(94, 28, 25, 0.96)" : "rgba(7, 8, 13, 0.9)";
    context.strokeStyle = human ? "rgba(139, 199, 218, 0.95)" : active ? "rgba(255, 205, 118, 0.98)" : "rgba(232, 163, 61, 0.56)";
    context.lineWidth = 5;
    context.beginPath();
    context.roundRect(5, 5, 502, 134, 25);
    context.fill();
    context.stroke();
    context.font = "600 48px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = alive ? "#f4e8d1" : "#777179";
    context.shadowColor = active ? "rgba(232, 163, 61, 0.8)" : "rgba(0, 0, 0, 0.8)";
    context.shadowBlur = 12;
    context.fillText(`${human ? "YOU · " : ""}${name.slice(0, 16)}`, 256, 72, 455);

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    return map;
  }, [active, alive, human, name]);

  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;

  return (
    <sprite position={[0, 2.35, 0.06]} scale={[1.36, 0.38, 1]} renderOrder={12}>
      <spriteMaterial map={texture} transparent depthTest={false} toneMapped={false} />
    </sprite>
  );
}

function RoleSigil({ role }: { role: Role }) {
  const texture = useLoader(THREE.TextureLoader, roleArtifactFor(role));
  const prepared = useMemo(() => {
    const clone = texture.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.needsUpdate = true;
    return clone;
  }, [texture]);

  return (
    <sprite position={[0.43, 1.22, 0.16]} scale={[0.35, 0.35, 1]} renderOrder={11}>
      <spriteMaterial map={prepared} transparent depthTest={false} toneMapped={false} />
    </sprite>
  );
}

function Villager({
  player,
  index,
  count,
  active,
  selected,
  mode,
  phase,
  reduceMotion,
  onSelect,
}: {
  player: CouncilPlayer;
  index: number;
  count: number;
  active: boolean;
  selected: boolean;
  mode: CouncilCameraMode;
  phase: string;
  reduceMotion: boolean;
  onSelect: (seatId: string) => void;
}) {
  const portraitUrl = portraitForSeat(player.seatId) ?? "/portraits/mara.webp";
  const portrait = useLoader(THREE.TextureLoader, portraitUrl);
  const prepared = useMemo(() => {
    const clone = portrait.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.needsUpdate = true;
    return clone;
  }, [portrait]);
  const group = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const basePosition = useMemo(() => seatPosition(index, count, mode), [count, index, mode]);

  useFrame(({ clock, camera }, delta) => {
    if (!group.current) return;
    const speakingStep = active && mode === "cinematic" ? 0.56 : 0;
    const target = basePosition.clone();
    target.z += speakingStep;
    group.current.position.lerp(target, reduceMotion ? 1 : 1 - Math.exp(-delta * 4));
    const breathe = !reduceMotion && player.alive ? Math.sin(clock.elapsedTime * 1.55 + index) * 0.018 : 0;
    group.current.position.y = breathe;
    group.current.lookAt(camera.position.x, group.current.position.y + 1.1, camera.position.z);
    if (shadow.current && !reduceMotion) shadow.current.rotation.z = clock.elapsedTime * 0.12;
  });

  const cloakColor = player.human ? "#244553" : active ? "#5b2524" : index % 2 ? "#20242d" : "#2e2425";

  return (
    <group
      ref={group}
      position={basePosition}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(player.seatId);
      }}
      onPointerEnter={() => { document.body.style.cursor = "pointer"; }}
      onPointerLeave={() => { document.body.style.cursor = "default"; }}
    >
      <mesh position={[0, 0.78, -0.02]} castShadow>
        <coneGeometry args={[0.48, 1.25, 8]} />
        <meshStandardMaterial
          color={player.alive ? cloakColor : "#15151a"}
          roughness={0.94}
          metalness={0.02}
          transparent
          opacity={player.alive ? 1 : 0.42}
        />
      </mesh>
      <mesh position={[-0.3, 0.88, -0.01]} rotation={[0, 0, -0.35]}>
        <capsuleGeometry args={[0.085, 0.55, 4, 8]} />
        <meshStandardMaterial color={player.alive ? cloakColor : "#15151a"} roughness={0.95} />
      </mesh>
      <mesh position={[0.3, 0.88, -0.01]} rotation={[0, 0, 0.35]}>
        <capsuleGeometry args={[0.085, 0.55, 4, 8]} />
        <meshStandardMaterial color={player.alive ? cloakColor : "#15151a"} roughness={0.95} />
      </mesh>

      <mesh position={[0, 1.46, 0.035]} scale={active || selected ? 1.06 : 1}>
        <planeGeometry args={[0.86, 1.02]} />
        <meshBasicMaterial
          map={prepared}
          transparent
          opacity={player.alive ? 1 : 0.24}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 1.46, 0.008]}>
        <planeGeometry args={[0.94, 1.1]} />
        <meshStandardMaterial
          color={player.human ? "#79b9cc" : active ? "#e8a33d" : player.alive ? "#3b2925" : "#16151a"}
          emissive={active ? "#6d2d1e" : player.human ? "#163c4a" : "#000000"}
          emissiveIntensity={active ? 1.4 : 0.55}
          roughness={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Nameplate name={player.name} active={active || selected} alive={player.alive} human={player.human} />
      {player.role && <RoleSigil role={player.role} />}

      {(active || selected) && player.alive && (
        <mesh ref={shadow} position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.48, 0.56, 48]} />
          <meshBasicMaterial color={player.human ? "#85c7d9" : "#e8a33d"} transparent opacity={0.85} />
        </mesh>
      )}
      {!player.alive && (
        <group>
          <mesh position={[0, 0.2, 0.05]}>
            <cylinderGeometry args={[0.18, 0.24, 0.42, 10]} />
            <meshStandardMaterial color="#39363e" roughness={1} />
          </mesh>
          <pointLight position={[0, 0.55, 0.25]} intensity={0.6} distance={1.1} color="#8e83a8" />
        </group>
      )}
      {phase === "night" && player.alive && (
        <pointLight position={[0, 1.15, 0.35]} color={active ? "#b95345" : "#7480a7"} intensity={active ? 1.3 : 0.3} distance={1.8} />
      )}
    </group>
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

function AccusationBeam({ from, to }: { from: THREE.Vector3; to: THREE.Vector3 }) {
  const { midpoint, length, quaternion } = useMemo(() => {
    const start = from.clone().add(new THREE.Vector3(0, 0.12, 0));
    const end = to.clone().add(new THREE.Vector3(0, 0.12, 0));
    const direction = end.clone().sub(start);
    return {
      midpoint: start.clone().add(end).multiplyScalar(0.5),
      length: direction.length(),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
    };
  }, [from, to]);

  return (
    <mesh position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[0.018, 0.018, length, 8]} />
      <meshBasicMaterial color="#d04455" transparent opacity={0.82} />
    </mesh>
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
  selectedSeatId,
  phase,
  event,
  mode,
  reduceMotion,
  onSelect,
}: {
  players: CouncilPlayer[];
  activeSeatId: string | null;
  selectedSeatId: string | null;
  phase: string;
  event: CouncilEvent | null;
  mode: CouncilCameraMode;
  reduceMotion: boolean;
  onSelect: (seatId: string) => void;
}) {
  const isNight = phase === "night" || phase === "lobby";
  const focusSeatId = selectedSeatId ?? activeSeatId;
  const voterIndex = event?.seatId ? players.findIndex((player) => player.seatId === event.seatId) : -1;
  const targetIndex = event?.target ? players.findIndex((player) => player.name === event.target) : -1;

  return (
    <>
      <CameraDirector players={players} focusSeatId={focusSeatId} mode={mode} reduceMotion={reduceMotion} />
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

      {players.map((player, index) => (
        <Villager
          key={player.seatId}
          player={player}
          index={index}
          count={players.length}
          active={activeSeatId === player.seatId}
          selected={selectedSeatId === player.seatId}
          mode={mode}
          phase={phase}
          reduceMotion={reduceMotion}
          onSelect={onSelect}
        />
      ))}

      {event?.type === "vote" && voterIndex >= 0 && targetIndex >= 0 && (
        <AccusationBeam
          from={seatPosition(voterIndex, players.length, mode)}
          to={seatPosition(targetIndex, players.length, mode)}
        />
      )}
    </>
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
    if (typeof document === "undefined") return true;
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  });
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  if (!webglSupported) {
    return <div className="council-3d-fallback">Cinematic view unavailable. The game remains fully playable below.</div>;
  }

  return (
    <Canvas
      shadows
      dpr={[1, 1.45]}
      frameloop={reduceMotion ? "demand" : "always"}
      camera={{ position: [0, 3.35, 8.25], fov: 42, near: 0.1, far: 32 }}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
      onPointerMissed={() => setSelectedSeatId(null)}
    >
      <Suspense fallback={null}>
        <Scene
          players={players}
          activeSeatId={activeSeatId}
          selectedSeatId={activeSeatId ? null : selectedSeatId}
          phase={phase}
          event={event}
          mode={cameraMode}
          reduceMotion={reduceMotion}
          onSelect={(seatId) => setSelectedSeatId((current) => current === seatId ? null : seatId)}
        />
      </Suspense>
    </Canvas>
  );
}
