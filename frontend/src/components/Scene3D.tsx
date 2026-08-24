import { useEffect, useState, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import * as THREE from "three";
import { OrbitControls, Html, Sparkles, Billboard, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
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
  const radius = 5.5;
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

// A soft volumetric-looking light beam, movie-set style: a thin translucent
// cone with additive blending, angled down toward the platform.
function LightBeam({ position, rotation, color = "#8ba3ff" }: {
  position: [number, number, number];
  rotation: [number, number, number];
  color?: string;
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <coneGeometry args={[2.2, 10, 32, 1, true]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.06}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

export function Scene3D() {
  const [titleStates, setTitleStates] = useState<Record<string, TitleState>>(
    {},
  );
  const [titleMeta, setTitleMeta] = useState<Record<string, TitleMeta>>({});
  const isPausedRef = useRef(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { decisions, sendAction } = useAgentSocket();

  const spotLightRef = useRef<THREE.SpotLight>(null);
  const spotLightTargetRef = useRef(new THREE.Object3D());

  useEffect(() => {
    if (spotLightRef.current) {
      spotLightRef.current.target = spotLightTargetRef.current;
    }
  }, []);

  const latestDecision = decisions[0] ?? null;
  const agentTitleIndex = latestDecision
    ? TITLES.indexOf(latestDecision.titleId)
    : -1;
  const agentTargetPosition: [number, number, number] =
    agentTitleIndex !== -1
      ? titlePosition(agentTitleIndex, TITLES.length)
      : [0, 2, 0];
  const isAgentActive = latestDecision?.status === "pending";

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  function toggleFullscreen() {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);


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
    <div ref={containerRef} className="relative h-150 rounded-2xl border border-border bg-surface/40 overflow-hidden">
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 z-10 text-xs font-mono px-3 py-1.5 rounded-lg border border-border bg-surface/80 hover:border-marquee/50 transition-colors text-ink backdrop-blur-sm"
      >
        {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      </button>

      {isAgentActive && latestDecision && (
        <div className="absolute bottom-4 left-4 z-10 w-80 rounded-xl border border-border bg-surface/95 backdrop-blur-sm shadow-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-marquee animate-pulse" />
            <span className="text-xs font-mono uppercase tracking-wide text-marquee">
              Agent finding
            </span>
          </div>

          <p className="font-bold font-mono text-sm text-ink mb-1">
            {titleMeta[latestDecision.titleId]?.name ?? latestDecision.titleId}
          </p>

          <p className="text-sm text-ink mb-2">{latestDecision.summary}</p>

          {latestDecision.reasoningTrail?.length > 0 && (
            <ol className="space-y-1.5 mb-3 border-l border-border/60 pl-3">
              {latestDecision.reasoningTrail.map((step) => (
                <li key={step.id} className="text-xs">
                  <span className="font-mono uppercase tracking-wide text-marquee/80 mr-1.5">
                    {step.label}
                  </span>
                  <span className="text-muted-foreground">{step.detail}</span>
                </li>
              ))}
            </ol>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => sendAction(latestDecision.id, "accept")}
              className="flex-1 text-xs font-mono py-1.5 rounded-lg bg-scope text-void font-semibold hover:opacity-90 transition-opacity"
            >
              Accept
            </button>
            <button
              onClick={() => sendAction(latestDecision.id, "reject")}
              className="flex-1 text-xs font-mono py-1.5 rounded-lg border border-border text-ink hover:border-tally/50 transition-colors"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      <Canvas camera={{ position: [0, 6, 10], fov: 50 }}>
        <color attach="background" args={["#05070f"]} />
        <fog attach="fog" args={["#0a0e1a", 10, 16]} />
        <Stars radius={80} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />

        <Sparkles count={150} scale={[18, 6, 18]} size={1.5} speed={0.15} opacity={0.4} color="#8ba3ff" />

        <AutoOrbitCamera isPausedRef={isPausedRef} />

        <mesh position={[0, -1.5, 0]} receiveShadow>
          <cylinderGeometry args={[8, 8, 0.3, 64]} />
          <meshStandardMaterial color="#1c2340" metalness={0.6} roughness={0.3} />
        </mesh>

        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -1.34, 0]}>
          <torusGeometry args={[8, 0.05, 16, 100]} />
          <meshStandardMaterial color="#8ba3ff" emissive="#8ba3ff" emissiveIntensity={1.2} />
        </mesh>

        <spotLight
          ref={spotLightRef}
          position={[0, 8, 0]}
          angle={0.6}
          penumbra={0.6}
          intensity={8}
          color="#8ba3ff"
          castShadow
        />
        <primitive object={spotLightTargetRef.current} position={[0, -1.5, 0]} />
        <ambientLight intensity={0.4} />
        <hemisphereLight args={["#4a5578", "#0a0e1a", 0.6]} />
        <pointLight position={[10, 10, 10]} intensity={2} />
        <pointLight position={[-8, 6, -8]} intensity={1} color="#6b8cff" />

        <LightBeam position={[6, 9, 6]} rotation={[0, 0, Math.PI * 0.08]} color="#8ba3ff" />
        <LightBeam position={[-6, 9, -6]} rotation={[0, 0, -Math.PI * 0.06]} color="#f5a623" />
        <LightBeam position={[0, 9, -8]} rotation={[Math.PI * 0.05, 0, 0]} color="#6b8cff" />

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
                  emissiveIntensity={0.7}
                  roughness={0.4}
                  metalness={0.2}
                />
              </mesh>

              {meta?.posterUrl && (
                <Billboard position={[0, radius + 1.6, 0]}>
                  <Html center distanceFactor={8} transform>
                    <div className="group relative w-24 cursor-pointer pointer-events-auto">
                      <div className="relative overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10 transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-translate-y-1">
                        <img
                          src={meta.posterUrl}
                          alt={meta.name}
                          className="w-full aspect-2/3 object-cover"
                          draggable={false}
                        />
                        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black via-black/60 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-2">
                          <p className="text-white text-xs font-bold font-mono leading-tight drop-shadow-lg">
                            {meta.name}
                          </p>
                          <div
                            className={`mt-1 h-1 rounded-full ${isAnomaly ? "bg-tally" : "bg-scope"}`}
                          />
                        </div>
                      </div>
                    </div>
                  </Html>
                </Billboard>
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

        <EffectComposer>
          <Bloom
            intensity={1.2}
            luminanceThreshold={0.15}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
