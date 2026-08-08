"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { portraitForSeat, roleArtifactFor } from "@/lib/portraits";
import type { Role } from "@/lib/types";

export interface CouncilPlayer {
  seatId: string;
  name: string;
  alive: boolean;
  role: Role | null;
}

function CameraRig() {
  const { camera } = useThree();

  useEffect(() => {
    camera.lookAt(0, 0.15, 0);
  }, [camera]);

  return null;
}

function RoleArtifact({ role }: { role: Role }) {
  const texture = useLoader(THREE.TextureLoader, roleArtifactFor(role));
  const srgbTexture = useMemo(() => {
    const prepared = texture.clone();
    prepared.colorSpace = THREE.SRGBColorSpace;
    prepared.needsUpdate = true;
    return prepared;
  }, [texture]);

  return (
    <sprite position={[0.38, -0.31, 0.08]} scale={[0.36, 0.36, 1]}>
      <spriteMaterial map={srgbTexture} transparent depthTest={false} />
    </sprite>
  );
}

function Nameplate({ name, active, alive }: { name: string; active: boolean; alive: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.fillStyle = active ? "rgba(81, 27, 25, 0.94)" : "rgba(8, 7, 12, 0.88)";
    context.strokeStyle = active ? "rgba(255, 205, 118, 0.95)" : "rgba(232, 163, 61, 0.58)";
    context.lineWidth = 5;
    context.beginPath();
    context.roundRect(5, 5, 502, 118, 24);
    context.fill();
    context.stroke();
    context.font = "600 50px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = alive ? "#f4e8d1" : "#777179";
    context.shadowColor = active ? "rgba(232, 163, 61, 0.8)" : "rgba(0, 0, 0, 0.8)";
    context.shadowBlur = 12;
    context.fillText(name.slice(0, 18), 256, 66, 455);

    const prepared = new THREE.CanvasTexture(canvas);
    prepared.colorSpace = THREE.SRGBColorSpace;
    prepared.needsUpdate = true;
    return prepared;
  }, [active, alive, name]);

  useEffect(() => () => texture?.dispose(), [texture]);

  if (!texture) return null;
  return (
    <sprite position={[0, 0.7, 0.08]} scale={[1.25, 0.31, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthTest={false} toneMapped={false} />
    </sprite>
  );
}

function Candle({ alive, active, reduceMotion }: { alive: boolean; active: boolean; reduceMotion: boolean }) {
  const flame = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!flame.current || reduceMotion || !alive) return;
    const flicker = 1 + Math.sin(clock.elapsedTime * 9.2) * 0.12;
    flame.current.scale.set(flicker, 0.88 + flicker * 0.12, flicker);
  });

  return (
    <group position={[0.54, -0.37, 0.04]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.055, 0.075, 0.28, 12]} />
        <meshStandardMaterial color={alive ? "#d8b47b" : "#343039"} roughness={0.9} />
      </mesh>
      {alive && (
        <>
          <mesh ref={flame} position={[0, 0.2, 0]}>
            <sphereGeometry args={[0.055, 12, 12]} />
            <meshBasicMaterial color={active ? "#fff2a6" : "#e8a33d"} />
          </mesh>
          {active && <pointLight position={[0, 0.24, 0.12]} color="#ffb75e" intensity={2.5} distance={2.2} />}
        </>
      )}
    </group>
  );
}

function CouncilSeat({
  player,
  index,
  count,
  active,
  reduceMotion,
}: {
  player: CouncilPlayer;
  index: number;
  count: number;
  active: boolean;
  reduceMotion: boolean;
}) {
  const portraitUrl = portraitForSeat(player.seatId) ?? "/portraits/mara.webp";
  const texture = useLoader(THREE.TextureLoader, portraitUrl);
  const srgbTexture = useMemo(() => {
    const prepared = texture.clone();
    prepared.colorSpace = THREE.SRGBColorSpace;
    prepared.needsUpdate = true;
    return prepared;
  }, [texture]);
  const group = useRef<THREE.Group>(null);
  const angle = (index / count) * Math.PI * 2 + Math.PI;
  const radius = 2.55;
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;

  useFrame(({ clock, camera }) => {
    if (!group.current) return;
    group.current.lookAt(camera.position);
    group.current.position.y =
      0.62 + (active && !reduceMotion ? Math.sin(clock.elapsedTime * 2.5) * 0.055 : 0);
  });

  return (
    <>
      <group ref={group} position={[x, 0.62, z]}>
        <mesh castShadow scale={active ? 1.08 : 1}>
          <planeGeometry args={[0.82, 0.94]} />
          <meshBasicMaterial
            map={srgbTexture}
            transparent
            opacity={player.alive ? 1 : 0.27}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, 0, -0.018]}>
          <planeGeometry args={[0.9, 1.02]} />
          <meshStandardMaterial
            color={active ? "#e8a33d" : player.alive ? "#4a2f25" : "#17151a"}
            emissive={active ? "#6d2d1e" : "#000000"}
            roughness={0.7}
            side={THREE.DoubleSide}
          />
        </mesh>
        <Nameplate name={player.name} active={active} alive={player.alive} />
        {player.role && <RoleArtifact role={player.role} />}
        <Candle alive={player.alive} active={active} reduceMotion={reduceMotion} />
      </group>

      {active && (
        <mesh position={[x, 0.43, z]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.57, 0.025, 12, 48]} />
          <meshBasicMaterial color="#e8a33d" transparent opacity={0.82} />
        </mesh>
      )}
    </>
  );
}

function RitualHeart({ active, isNight, reduceMotion }: { active: boolean; isNight: boolean; reduceMotion: boolean }) {
  const heart = useRef<THREE.Group>(null);
  const innerRing = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (reduceMotion) return;
    if (heart.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * (active ? 3.4 : 1.7)) * (active ? 0.08 : 0.035);
      heart.current.scale.setScalar(pulse);
      heart.current.position.y = 0.63 + Math.sin(clock.elapsedTime * 1.25) * 0.035;
    }
    if (innerRing.current) innerRing.current.rotation.z = clock.elapsedTime * 0.22;
  });

  return (
    <group ref={heart} position={[0, 0.63, 0]}>
      <mesh castShadow>
        <icosahedronGeometry args={[0.19, 1]} />
        <meshStandardMaterial
          color={isNight ? "#8c4162" : "#d28a4b"}
          emissive={active ? "#d04455" : isNight ? "#59213c" : "#7b3d1d"}
          emissiveIntensity={active ? 4.2 : 2.4}
          roughness={0.24}
          metalness={0.28}
        />
      </mesh>
      <mesh ref={innerRing} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.34, 0.015, 8, 48]} />
        <meshBasicMaterial color={active ? "#ffb066" : "#9d617d"} transparent opacity={0.72} />
      </mesh>
      <pointLight color={active ? "#d04455" : "#8d4d72"} intensity={active ? 6 : 3.5} distance={5} />
    </group>
  );
}

function DriftingEmbers({ isNight, reduceMotion }: { isNight: boolean; reduceMotion: boolean }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const values = new Float32Array(72 * 3);
    for (let index = 0; index < 72; index += 1) {
      const radius = 2.2 + ((index * 37) % 100) / 35;
      const angle = index * 2.39996;
      values[index * 3] = Math.sin(angle) * radius;
      values[index * 3 + 1] = 0.25 + ((index * 53) % 100) / 38;
      values[index * 3 + 2] = Math.cos(angle) * radius;
    }
    return values;
  }, []);

  useFrame(({ clock }) => {
    if (!points.current || reduceMotion) return;
    points.current.rotation.y = clock.elapsedTime * 0.025;
    points.current.position.y = Math.sin(clock.elapsedTime * 0.35) * 0.08;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={isNight ? "#b87ca6" : "#f1ae61"}
        size={0.035}
        transparent
        opacity={isNight ? 0.52 : 0.38}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function Scene({
  players,
  activeSeatId,
  isNight,
  reduceMotion,
}: {
  players: CouncilPlayer[];
  activeSeatId: string | null;
  isNight: boolean;
  reduceMotion: boolean;
}) {
  const fogColor = isNight ? "#080712" : "#19100c";

  return (
    <>
      <CameraRig />
      <color attach="background" args={[fogColor]} />
      <fog attach="fog" args={[fogColor, 7, 14]} />
      <ambientLight intensity={isNight ? 0.52 : 0.85} color={isNight ? "#7772bd" : "#ffd7a0"} />
      <directionalLight
        castShadow
        position={[-3, 7, 4]}
        intensity={isNight ? 1.2 : 2.1}
        color={isNight ? "#a9b1ff" : "#ffc47a"}
      />
      <pointLight position={[0, 2.3, 0]} intensity={isNight ? 5 : 3} distance={8} color="#d04455" />
      <DriftingEmbers isNight={isNight} reduceMotion={reduceMotion} />
      <RitualHeart active={activeSeatId !== null} isNight={isNight} reduceMotion={reduceMotion} />

      <mesh receiveShadow position={[0, 0.1, 0]}>
        <cylinderGeometry args={[3.55, 3.75, 0.4, 64]} />
        <meshStandardMaterial color="#24110f" roughness={0.82} metalness={0.08} />
      </mesh>
      <mesh receiveShadow position={[0, -0.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[8, 64]} />
        <meshStandardMaterial color="#08070a" roughness={1} />
      </mesh>
      <mesh position={[0, 0.33, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 1.45, 64]} />
        <meshStandardMaterial color="#43171c" emissive="#28090d" emissiveIntensity={1.4} roughness={0.8} />
      </mesh>

      {players.map((player, index) => (
        <CouncilSeat
          key={player.seatId}
          player={player}
          index={index}
          count={players.length}
          active={activeSeatId === player.seatId}
          reduceMotion={reduceMotion}
        />
      ))}
    </>
  );
}

export function CouncilTable3D({
  players,
  activeSeatId,
  isNight,
}: {
  players: CouncilPlayer[];
  activeSeatId: string | null;
  isNight: boolean;
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

  if (webglSupported === false) {
    return <div className="council-3d-fallback">3D view unavailable. The game remains fully playable below.</div>;
  }
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      frameloop={reduceMotion ? "demand" : "always"}
      camera={{ position: [0, 6.2, 7.2], fov: 38, near: 0.1, far: 30 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <Suspense fallback={null}>
        <Scene
          players={players}
          activeSeatId={activeSeatId}
          isNight={isNight}
          reduceMotion={reduceMotion}
        />
      </Suspense>
    </Canvas>
  );
}
