import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import * as THREE from "three";
import { OrbitControls, Html, Sparkles, Billboard, Stars, Line } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { getSnapshot, getAnomalies, getTitles } from "../api/client";
import { useAgentSocket } from "../hooks/useAgentSocket";

// Same 20 pinned title_ids as the simulator (aurora-01..20), kept in a fixed
// circular layout. Position stays constant; size and color react to live data.
const TITLES = [
  "aurora-01", "aurora-02", "aurora-03", "aurora-04", "aurora-05",
  "aurora-06", "aurora-07", "aurora-08", "aurora-09", "aurora-10",
  "aurora-11", "aurora-12", "aurora-13", "aurora-14", "aurora-15",
  "aurora-16", "aurora-17", "aurora-18", "aurora-19", "aurora-20",
];

const BASE_COLOR = "#3b82f6"; // scope-ish blue, no anomaly
const ANOMALY_COLOR = "#ef4444"; // tally-red, active anomaly

// Sphere radius scales with viewer_count between these bounds so a title
// with 0 viewers is still visible and a very popular one doesn't dwarf the scene.
const MIN_RADIUS = 0.5;
const MAX_RADIUS = 1.6;
const VIEWER_COUNT_FOR_MAX_RADIUS = 70; // tuning knob, adjust after watching real data

const ORBIT_COUNT = 3;
const ORBIT_RADIUS = 10;
const ORBIT_TILT_DEG = 70; // same tilt for every ring, only the Y rotation differs

function titlePosition(index: number, total: number): [number, number, number] {
  const orbitIndex = index % ORBIT_COUNT;
  const positionInOrbit = Math.floor(index / ORBIT_COUNT);
  const countInOrbit = Math.ceil(total / ORBIT_COUNT);

  const theta = (positionInOrbit / countInOrbit) * Math.PI * 2;
  const localX = Math.cos(theta) * ORBIT_RADIUS;
  const localZ = Math.sin(theta) * ORBIT_RADIUS;

  // Tilt the ring around the X axis, then rotate the whole ring around Y
  // by 60° increments per orbit — same construction as the React atom logo.
  const tiltRad = (ORBIT_TILT_DEG * Math.PI) / 180;
  const tiltedY = localZ * Math.sin(tiltRad);
  const tiltedZ = localZ * Math.cos(tiltRad);

  const rotYRad = (orbitIndex * 60 * Math.PI) / 180;
  const finalX = localX * Math.cos(rotYRad) + tiltedZ * Math.sin(rotYRad);
  const finalZ = -localX * Math.sin(rotYRad) + tiltedZ * Math.cos(rotYRad);

  return [finalX, tiltedY, finalZ];
}

const ORBIT_COLORS = ["#61dafb", "#8ba3ff", "#f5a623"]; // une teinte par orbite


function orbitRingPoints(orbitIndex: number, segments = 128): Vector3[] {
  const tiltRad = (ORBIT_TILT_DEG * Math.PI) / 180;
  const rotYRad = (orbitIndex * 60 * Math.PI) / 180;
  const points: Vector3[] = [];

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const localX = Math.cos(theta) * ORBIT_RADIUS;
    const localZ = Math.sin(theta) * ORBIT_RADIUS;

    const tiltedY = localZ * Math.sin(tiltRad);
    const tiltedZ = localZ * Math.cos(tiltRad);

    const finalX = localX * Math.cos(rotYRad) + tiltedZ * Math.sin(rotYRad);
    const finalZ = -localX * Math.sin(rotYRad) + tiltedZ * Math.cos(rotYRad);

    points.push(new Vector3(finalX, tiltedY, finalZ));
  }

  return points;
}

function OrbitRing({ orbitIndex, color }: { orbitIndex: number; color: string }) {
  return (
    <Line
      points={orbitRingPoints(orbitIndex)}
      color={color}
      transparent
      opacity={0.35}
      lineWidth={1}
    />
  );
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
    const radius = 20; // widened to clear the outer ring (up to ~12.5 from center)
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
  const navigate = useNavigate();

  const spotLightRef = useRef<THREE.SpotLight>(null);
  const spotLightTargetRef = useRef(new THREE.Object3D());

  useEffect(() => {
    if (spotLightRef.current) {
      spotLightRef.current.target = spotLightTargetRef.current;
    }
  }, []);

  const pendingDecisions = decisions.filter((d) => d.status === "pending");
  const [activeIndex, setActiveIndex] = useState(0);
  const clampedIndex = Math.min(activeIndex, Math.max(pendingDecisions.length - 1, 0));
  const activeDecision = pendingDecisions[clampedIndex] ?? null;

  const [toast, setToast] = useState<{ type: "accept" | "reject"; title: string } | null>(null);

  const agentTitleIndex = activeDecision
    ? TITLES.indexOf(activeDecision.titleId)
    : -1;
  const agentTargetPosition: [number, number, number] =
    agentTitleIndex !== -1
      ? titlePosition(agentTitleIndex, TITLES.length)
      : [0, 2, 0];
  const isAgentActive = activeDecision !== null;

  function handleAction(decision: NonNullable<typeof activeDecision>, action: "accept" | "reject") {
    sendAction(decision.id, action);
    setToast({ type: action, title: titleMeta[decision.titleId]?.name ?? decision.titleId });
    setTimeout(() => setToast(null), 2800);
    setActiveIndex(0); // move to whichever pending decision is now first, once this one clears
  }

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
    <div ref={containerRef} className="relative h-250 rounded-2xl border border-border bg-surface/40 overflow-hidden">
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 z-10 text-xs font-mono px-3 py-1.5 rounded-lg border border-border bg-surface/80 hover:border-marquee/50 transition-colors text-ink backdrop-blur-sm"
      >
        {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      </button>

        {isAgentActive && activeDecision && (
        <div className="absolute bottom-4 left-4 z-10 w-80 rounded-xl border border-border bg-surface/95 backdrop-blur-sm shadow-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-marquee animate-pulse" />
              <span className="text-xs font-mono uppercase tracking-wide text-marquee">
                Agent finding
              </span>
            </div>
            {pendingDecisions.length > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setActiveIndex((i) => (i - 1 + pendingDecisions.length) % pendingDecisions.length)}
                  className="w-5 h-5 flex items-center justify-center rounded border border-border text-muted-foreground hover:border-marquee/50 hover:text-marquee transition-colors text-xs"
                  aria-label="Previous pending finding"
                >
                  ‹
                </button>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {clampedIndex + 1}/{pendingDecisions.length}
                </span>
                <button
                  onClick={() => setActiveIndex((i) => (i + 1) % pendingDecisions.length)}
                  className="w-5 h-5 flex items-center justify-center rounded border border-border text-muted-foreground hover:border-marquee/50 hover:text-marquee transition-colors text-xs"
                  aria-label="Next pending finding"
                >
                  ›
                </button>
              </div>
            )}
          </div>

          <p className="font-bold font-mono text-sm text-ink mb-1">
            {titleMeta[activeDecision.titleId]?.name ?? activeDecision.titleId}
          </p>

          <p className="text-sm text-ink mb-2">{activeDecision.summary}</p>

          {activeDecision.reasoningTrail?.length > 0 && (
            <ol className="space-y-1.5 mb-3 border-l border-border/60 pl-3">
              {activeDecision.reasoningTrail.map((step) => (
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
              onClick={() => handleAction(activeDecision, "accept")}
              className="flex-1 text-xs font-mono py-1.5 rounded-lg bg-scope text-void font-semibold hover:opacity-90 transition-opacity"
            >
              Accept
            </button>
            <button
              onClick={() => handleAction(activeDecision, "reject")}
              className="flex-1 text-xs font-mono py-1.5 rounded-lg border border-border text-ink hover:border-tally/50 transition-colors"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`absolute bottom-4 right-4 z-10 rounded-lg border px-4 py-2.5 text-xs font-mono shadow-2xl backdrop-blur-sm transition-opacity ${
            toast.type === "accept"
              ? "bg-scope/15 border-scope/40 text-scope"
              : "bg-tally/15 border-tally/40 text-tally"
          }`}
        >
          {toast.type === "accept" ? "Accepted" : "Rejected"} — {toast.title}
        </div>
      )}

      <Canvas camera={{ position: [0, 9, 19], fov: 50 }}>
        <color attach="background" args={["#05070f"]} />
        <fog attach="fog" args={["#0a0e1a", 12, 26]} />
        <Stars radius={80} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />

        <Sparkles count={150} scale={[18, 6, 18]} size={1.5} speed={0.15} opacity={0.4} color="#8ba3ff" />

        <AutoOrbitCamera isPausedRef={isPausedRef} />

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

        {[0, 1, 2].map((orbitIndex) => (
          <OrbitRing key={orbitIndex} orbitIndex={orbitIndex} color={ORBIT_COLORS[orbitIndex]} />
        ))}
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
                    <div
                      className="group relative w-24 cursor-pointer pointer-events-auto"
                      onClick={() => navigate(`/titles/${titleId}`)}
                    >
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
