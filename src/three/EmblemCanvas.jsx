import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, Sparkles } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

import { EMBLEM_PATH, EMBLEM_SIZE } from "./emblemPath";
import { sceneTargetFor } from "./sceneTargets";

// Scene palette (three.js needs hex/rgb; mirrors the gold + obsidian tokens in index.css).
const BG = "#0e0d0a";
const GOLD = "#d6b968";
const GOLD_DEEP = "#9c7f3c";
const BRONZE = "#b98a45";

// Feel constants
const EMBLEM_WIDTH = 4.2;
const SCALE = EMBLEM_WIDTH / EMBLEM_SIZE.width;
const EXPLODE_DISTANCE = 1.5;
const SCROLL_EXPLODE = 0.85; // explode added per screen scrolled
const MAX_SCROLL_EXPLODE = 2.4;
const FOLLOW = 2.6; // damping rate toward targets
const POINTER_TILT = 0.38;

function seeded(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function buildShards() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${EMBLEM_PATH}"/></svg>`;
  const data = new SVGLoader().parse(svg);
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  const cx = EMBLEM_SIZE.width / 2;
  const cy = EMBLEM_SIZE.height / 2;

  return shapes
    .map((shape, i) => {
      const pts = shape.getPoints(8);
      const box = new THREE.Box2().setFromPoints(pts);
      const c = box.getCenter(new THREE.Vector2());
      const area = (box.max.x - box.min.x) * (box.max.y - box.min.y);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 360,
        bevelEnabled: true,
        bevelThickness: 110,
        bevelSize: 55,
        bevelSegments: 3,
        curveSegments: 8,
      });
      geometry.translate(-c.x, -c.y, -180);
      geometry.scale(SCALE, SCALE, SCALE);
      geometry.computeVertexNormals();
      const base = new THREE.Vector3((c.x - cx) * SCALE, (c.y - cy) * SCALE, 0);
      const dir = new THREE.Vector3(base.x, base.y, (seeded(i) - 0.5) * 2.4);
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
      dir.normalize().multiplyScalar(0.7 + seeded(i + 9) * 0.6);
      const spin = new THREE.Vector3(
        (seeded(i + 3) - 0.5) * 2.2,
        (seeded(i + 5) - 0.5) * 2.2,
        (seeded(i + 7) - 0.5) * 1.6
      );
      return { geometry, base, dir, spin, phase: seeded(i + 11) * Math.PI * 2, area };
    })
    .filter((s) => s.area > 40000);
}

function makeGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(232, 210, 140, 0.55)");
  g.addColorStop(0.35, "rgba(185, 138, 69, 0.18)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Emblem({ pathname, inputs }) {
  const shards = useMemo(buildShards, []);
  const glow = useMemo(makeGlowTexture, []);
  const root = useRef(null);
  const spinner = useRef(null);
  const meshes = useRef([]);
  const ringA = useRef(null);
  const ringB = useRef(null);
  const cur = useRef({ explode: 1.6, x: 0, y: 0, scale: 0.6, tilt: 0, time: 0 });

  useEffect(
    () => () => {
      shards.forEach((s) => s.geometry.dispose());
      glow.dispose();
    },
    [shards, glow]
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const c = cur.current;
    const inp = inputs.current;
    if (!inp.reduced) c.time += dt;
    const t = c.time;

    const { width, height } = state.size;
    const portrait = width < height * 0.95;
    const target = sceneTargetFor(pathname, portrait);
    const vp = state.viewport;
    const fitScale = Math.min(target.scale, (vp.width * 0.86) / EMBLEM_WIDTH);

    const screens =
      typeof window === "undefined" ? 0 : window.scrollY / Math.max(1, window.innerHeight);
    const wantExplode = target.explode + Math.min(screens * SCROLL_EXPLODE, MAX_SCROLL_EXPLODE);

    c.explode = THREE.MathUtils.damp(c.explode, wantExplode, FOLLOW, dt);
    c.x = THREE.MathUtils.damp(c.x, target.x, FOLLOW * 0.8, dt);
    c.y = THREE.MathUtils.damp(c.y, target.y + Math.min(screens, 2) * 0.25, FOLLOW * 0.8, dt);
    c.scale = THREE.MathUtils.damp(c.scale, fitScale, FOLLOW * 0.8, dt);
    c.tilt = THREE.MathUtils.damp(c.tilt, target.tilt, FOLLOW * 0.6, dt);

    if (root.current) {
      root.current.position.set(c.x, c.y + Math.sin(t * 0.8) * 0.06, 0);
      root.current.scale.setScalar(c.scale);
    }
    if (spinner.current) {
      spinner.current.rotation.y = THREE.MathUtils.damp(
        spinner.current.rotation.y,
        Math.sin(t * 0.22) * 0.45 + inp.pointer.x * POINTER_TILT + c.tilt + screens * 0.9,
        3,
        dt
      );
      spinner.current.rotation.x = THREE.MathUtils.damp(
        spinner.current.rotation.x,
        -inp.pointer.y * POINTER_TILT * 0.6 + Math.sin(t * 0.31) * 0.08,
        3,
        dt
      );
    }

    const e = c.explode;
    shards.forEach((s, i) => {
      const m = meshes.current[i];
      if (!m) return;
      const bob = Math.sin(t * 1.1 + s.phase) * 0.025 * (1 + e);
      m.position.set(
        s.base.x + s.dir.x * e * EXPLODE_DISTANCE,
        s.base.y + s.dir.y * e * EXPLODE_DISTANCE + bob,
        s.base.z + s.dir.z * e * EXPLODE_DISTANCE
      );
      m.rotation.set(
        s.spin.x * e * 0.6 + Math.sin(t * 0.7 + s.phase) * 0.04 * e,
        s.spin.y * e * 0.6,
        s.spin.z * e * 0.4
      );
    });

    if (ringA.current) {
      ringA.current.rotation.set(Math.PI / 2.3 + Math.sin(t * 0.2) * 0.1, t * 0.15, 0);
      ringA.current.scale.setScalar(1 + e * 0.25);
    }
    if (ringB.current) {
      ringB.current.rotation.set(Math.PI / 1.8, -t * 0.11, Math.PI / 5);
      ringB.current.scale.setScalar(1.15 + e * 0.35);
    }
  });

  return (
    <group ref={root}>
      <mesh position={[0, 0, -1.6]} renderOrder={-1}>
        <planeGeometry args={[11, 11]} />
        <meshBasicMaterial
          map={glow}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <group ref={spinner}>
        {shards.map((s, i) => (
          <mesh
            key={i}
            ref={(el) => {
              meshes.current[i] = el;
            }}
            geometry={s.geometry}
          >
            <meshPhysicalMaterial
              color={GOLD}
              metalness={1}
              roughness={0.26}
              clearcoat={0.7}
              clearcoatRoughness={0.2}
              envMapIntensity={1.4}
            />
          </mesh>
        ))}
      </group>
      <mesh ref={ringA}>
        <torusGeometry args={[2.7, 0.012, 8, 160]} />
        <meshStandardMaterial
          color={GOLD}
          metalness={1}
          roughness={0.3}
          emissive={GOLD_DEEP}
          emissiveIntensity={0.4}
        />
      </mesh>
      <mesh ref={ringB}>
        <torusGeometry args={[2.9, 0.006, 6, 160]} />
        <meshStandardMaterial
          color={BRONZE}
          metalness={1}
          roughness={0.35}
          emissive={GOLD_DEEP}
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
}

const DEBRIS_COUNT = 46;

function Debris({ inputs }) {
  const ref = useRef(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const items = useMemo(
    () =>
      Array.from({ length: DEBRIS_COUNT }, (_, i) => ({
        r: 3.5 + seeded(i + 20) * 5,
        a: seeded(i + 40) * Math.PI * 2,
        y: (seeded(i + 60) - 0.5) * 7,
        z: -2 - seeded(i + 80) * 6,
        s: 0.04 + seeded(i + 100) * 0.12,
        sp: 0.02 + seeded(i + 120) * 0.05,
      })),
    []
  );
  const time = useRef(0);

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    if (!inputs.current.reduced) time.current += Math.min(delta, 0.05);
    const t = time.current;
    const scroll =
      typeof window === "undefined" ? 0 : window.scrollY / Math.max(1, window.innerHeight);
    items.forEach((it, i) => {
      const a = it.a + t * it.sp;
      dummy.position.set(
        Math.cos(a) * it.r,
        it.y + Math.sin(t * 0.4 + i) * 0.2 - scroll * 0.4 * (it.s * 6),
        it.z
      );
      dummy.rotation.set(t * 0.3 + i, t * 0.2 + i * 0.5, 0);
      dummy.scale.setScalar(it.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, DEBRIS_COUNT]}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={GOLD} metalness={0.9} roughness={0.35} flatShading />
    </instancedMesh>
  );
}

function ReadySignal({ onReady }) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 3) onReady();
  });
  return null;
}

export default function EmblemCanvas({ pathname }) {
  const wrapper = useRef(null);
  const inputs = useRef({ pointer: { x: 0, y: 0 }, reduced: false });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    inputs.current.reduced = mq.matches;
    const onMove = (e) => {
      inputs.current.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      inputs.current.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <div ref={wrapper} className="absolute inset-0">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 9], fov: 35 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={[BG]} />
        <fog attach="fog" args={[BG, 9, 20]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 5]} intensity={2.4} color="#fff1cf" />
        <pointLight position={[-4, -2, 3]} intensity={28} color={BRONZE} />
        <pointLight position={[0, 3, -3]} intensity={22} color={GOLD} />
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={2.4} position={[0, 5, 2]} scale={[10, 3, 1]} color="#fff3d6" />
          <Lightformer
            intensity={1.4}
            position={[-5, 0, 1]}
            rotation-y={Math.PI / 2}
            scale={[12, 1, 1]}
            color="#e0b46a"
          />
          <Lightformer
            intensity={1.2}
            position={[5, -1, 1]}
            rotation-y={-Math.PI / 2}
            scale={[12, 1.5, 1]}
            color="#fff"
          />
          <Lightformer
            intensity={0.6}
            position={[0, -5, 0]}
            rotation-x={-Math.PI / 2}
            scale={[10, 10, 1]}
            color="#5a4520"
          />
        </Environment>
        <Emblem pathname={pathname} inputs={inputs} />
        <Debris inputs={inputs} />
        <Sparkles count={90} scale={[14, 8, 6]} size={2.4} speed={0.25} opacity={0.7} color={GOLD} />
        <ReadySignal onReady={() => wrapper.current?.setAttribute("data-scene-ready", "true")} />
      </Canvas>
    </div>
  );
}
