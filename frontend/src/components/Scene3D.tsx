import { useEffect, useState, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { PerspectiveCamera as PerspectiveCameraType } from "three";
import { Vector3 } from "three";
import * as THREE from "three";
import { OrbitControls, Html, Sparkles } from "@react-three/drei";
import { Fog } from "three";
import { getSnapshot, getAnomalies, getTitles } from "../api/client";
import { useAgentSocket } from "../hooks/useAgentSocket";

// Same 6 pinned title_ids as the simulator (aurora-01..06), kept in a fixed
// circular layout. Position stays constant; size and color react to live data.
const TITLES = [
  "aurora-01",
  "aurora-02",
  "aurora-03",
  "aurora-04",
  "aurora-05",
  "aurora-06",
];

const BASE_COLOR = "#3b82f6"; // scope-ish blue, no anomaly
const ANOMALY_COLOR = "#ef4444"; // tally-red, active anomaly

// Sphere radius scales with viewer_count between these bounds so a title
// with 0 viewers is still visible and a very popular one doesn't dwarf the scene.
const MIN_RADIUS = 0.5;
const MAX_RADIUS = 1.6;
const VIEWER_COUNT_FOR_MAX_RADIUS = 200; // tuning knob, adjust after watching real data

function titlePosition(index: number, total: number): [number, number, number] {
  const angle = (index / total) * Math.PI * 2;
  const radius = 5;
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
}

function radiusForViewerCount(viewerCount: number): number {
  const ratio = Math.min(viewerCount / VIEWER_COUNT_FOR_MAX_RADIUS, 1);
  return MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS);
}

interface TitleState {
  viewerCount: number;
  deviation: number; // highest deviation across regions for this title, 0 if none
}

interface TitleMeta {
  name: string;
  posterUrl: string | null;
}

function AutoOrbitCamera({
  isPausedRef,
}: {
  isPausedRef: React.RefObject<boolean>;
}) {
  const angleRef = useRef(0);

  useFrame((state, delta) => {
    if (isPausedRef.current) return;

    angleRef.current += delta * 0.05; // slow, ~2 minutes per full revolution
    const radius = 12;
    state.camera.position.x = Math.cos(angleRef.current) * radius;
    state.camera.position.z = Math.sin(angleRef.current) * radius;
    state.camera.position.y = 6;
    state.camera.lookAt(0, 0, 0);
  });

  return null;
}

// The agent orb: drifts toward whichever title the most recent decision
// concerns, and pulses while that decision is still "pending" (i.e. the
// agent is actively acting on it). Idles at the center otherwise.
function AgentOrb({
  targetPosition,
  isActive,
}: {
  targetPosition: [number, number, number];
  isActive: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const target = new Vector3(...targetPosition);
  target.y += 2; // hover above the sphere, not inside it

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    groupRef.current.position.lerp(target, delta * 1.5);

    if (isActive) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.25;
      groupRef.current.scale.setScalar(pulse);
    } else {
      groupRef.current.scale.setScalar(1);
    }
  });

  return (
    <group ref={groupRef}>
      <pointLight color="#f5a623" intensity={isActive ? 3 : 1} distance={4} />
      <mesh>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          color="#f5a623"
          emissive="#f5a623"
          emissiveIntensity={isActive ? 2 : 0.8}
        />
      </mesh>
      <Sparkles count={20} scale={1.2} size={2} speed={0.4} color="#f5a623" />
    </group>
  );
}

export function Scene3D() {
  const [titleStates, setTitleStates] = useState<Record<string, TitleState>>(
    {},
  );
  const [titleMeta, setTitleMeta] = useState<Record<string, TitleMeta>>({});
  const isPausedRef = useRef(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { decisions } = useAgentSocket();

  const latestDecision = decisions[0] ?? null;
  const agentTitleIndex = latestDecision
    ? TITLES.indexOf(latestDecision.titleId)
    : -1;
  const agentTargetPosition: [number, number, number] =
    agentTitleIndex !== -1
      ? titlePosition(agentTitleIndex, TITLES.length)
      : [0, 2, 0];
  const isAgentActive = latestDecision?.status === "pending";


  function handleControlsStart() {
    isPausedRef.current = true;
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
  }

  function handleControlsEnd() {
    // Resume auto-orbit a few seconds after the user lets go, not instantly,
    // so it doesn't feel like it's yanking the camera back mid-interaction.
    resumeTimeoutRef.current = setTimeout(() => {
      isPausedRef.current = false;
    }, 4000);
  }

  // Live data: polled every 5s, same pattern as the 2D dashboard components.
  useEffect(() => {
    function loadData() {
      Promise.all([getSnapshot(), getAnomalies()])
        .then(([snapshotRows, anomalyRows]) => {
          const next: Record<string, TitleState> = {};

          for (const titleId of TITLES) {
            const viewerCount = snapshotRows
              .filter((row) => row.title_id === titleId)
              .reduce((sum, row) => sum + row.viewer_count, 0);

            const deviation = anomalyRows
              .filter((row) => row.title_id === titleId)
              .reduce((max, row) => Math.max(max, row.deviation), 0);

            next[titleId] = { viewerCount, deviation };
          }

          setTitleStates(next);
        })
        .catch((err) => console.error("[Scene3D] failed to load data:", err));
    }

    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Title metadata (name + poster): static per title, fetched once on mount.
  useEffect(() => {
    getTitles()
      .then((rows) => {
        const next: Record<string, TitleMeta> = {};
        for (const row of rows) {
          next[row.title_id] = {
            name: row.title_name,
            posterUrl: row.poster_url,
          };
        }
        setTitleMeta(next);
      })
      .catch((err) =>
        console.error("[Scene3D] failed to load title metadata:", err),
      );
  }, []);

  return (
    <div className="h-150 rounded-2xl border border-border bg-surface/40 overflow-hidden">
      <Canvas camera={{ position: [0, 6, 10], fov: 50 }}>
        <fog attach="fog" args={["#0a0e1a", 10, 16]} />

        <AutoOrbitCamera isPausedRef={isPausedRef} />

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -1.5, 0]}
          receiveShadow
        >
          <circleGeometry args={[8, 64]} />
          <meshStandardMaterial color="#161b33" metalness={0.4} roughness={0.5} />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.49, 0]}>
          <ringGeometry args={[7.7, 8, 64]} />
          <meshStandardMaterial color="#6b8cff" emissive="#6b8cff" emissiveIntensity={0.6} />
        </mesh>

        <spotLight
          position={[0, 8, 0]}
          angle={0.5}
          penumbra={0.8}
          intensity={3}
          color="#8ba3ff"
          target-position={[0, -1.5, 0]}
        />
        <ambientLight intensity={0.4} />
        <hemisphereLight args={["#4a5578", "#0a0e1a", 0.6]} />
        <pointLight position={[10, 10, 10]} intensity={2} />
        <pointLight position={[-8, 6, -8]} intensity={1} color="#6b8cff" />

        {TITLES.map((titleId, i) => {
          const state = titleStates[titleId];
          const meta = titleMeta[titleId];
          const radius = state
            ? radiusForViewerCount(state.viewerCount)
            : MIN_RADIUS;
          const isAnomaly = state ? state.deviation > 0 : false;
          const position = titlePosition(i, TITLES.length);

          return (
            <group key={titleId} position={position}>
              <mesh>
                <sphereGeometry args={[radius, 32, 32]} />
                <meshStandardMaterial
                  color={isAnomaly ? ANOMALY_COLOR : BASE_COLOR}
                  emissive={isAnomaly ? ANOMALY_COLOR : BASE_COLOR}
                  emissiveIntensity={0.15}
                  roughness={0.4}
                  metalness={0.2}
                />
              </mesh>

              {meta?.posterUrl && (
                <Html
                  position={[0, radius + 0.6, 0]}
                  center
                  distanceFactor={10}
                >
                  <div className="flex flex-col items-center pointer-events-none">
                    <img
                      src={meta.posterUrl}
                      alt={meta.name}
                      className="w-16 rounded-md border border-border shadow-lg"
                    />
                    <span className="text-xs font-mono text-ink bg-void/80 px-1.5 py-0.5 rounded mt-1 whitespace-nowrap">
                      {meta.name}
                    </span>
                  </div>
                </Html>
              )}
            </group>
          );
        })}

        <AgentOrb targetPosition={agentTargetPosition} isActive={isAgentActive} />

        <OrbitControls
          enablePan={false}
          onStart={handleControlsStart}
          onEnd={handleControlsEnd}
        />
      </Canvas>
    </div>
  );
}
