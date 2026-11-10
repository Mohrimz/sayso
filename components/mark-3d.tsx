"use client";

import { useEffect, useRef } from "react";
import { LogoMark } from "@/components/logo";
import { MARK_EMBER, MARK_FOLDS, MARK_INK, MARK_VIEWBOX } from "@/lib/brand-mark";
import { cn } from "@/lib/utils";

/**
 * The Sayso mark as a real-time 3D object: a graphite ribbon with glossy ember
 * folds. It spins into place, then sways and follows the pointer. three.js is
 * only downloaded once the mark is on screen; the flat logo shows until then
 * (and stays if WebGL isn't available).
 */
export function Mark3D({ className, tone = "light" }: { className?: string; tone?: "light" | "ink" }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stop = () => {};
    let started = false;

    const seen = new IntersectionObserver((entries) => {
      if (started || !entries.some((e) => e.isIntersecting)) return;
      started = true;
      seen.disconnect();
      void start(el).then((cleanup) => {
        stop = cleanup;
      });
    });
    seen.observe(el);

    return () => {
      seen.disconnect();
      stop();
    };
  }, []);

  return (
    <div ref={host} aria-hidden className={cn("group/mark relative", className)}>
      <div className="absolute inset-x-[18%] bottom-[2%] h-[14%] rounded-[50%] bg-[#ff5b2e]/30 blur-xl transition-opacity duration-700 group-data-[ready]/mark:opacity-100 opacity-0" />
      <LogoMark
        tone={tone}
        className="absolute inset-[22%] size-auto transition-opacity duration-500 group-data-[ready]/mark:opacity-0"
      />
    </div>
  );
}

async function start(el: HTMLDivElement): Promise<() => void> {
  const [THREE, { SVGLoader }, { RoomEnvironment }] = await Promise.all([
    import("three"),
    import("three/addons/loaders/SVGLoader.js"),
    import("three/addons/environments/RoomEnvironment.js"),
  ]);
  if (!el.isConnected) return () => {};

  let renderer: InstanceType<typeof THREE.WebGLRenderer>;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return () => {};
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Neutral keeps the ember saturated (ACES would wash it out to peach).
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .6s ease";
  el.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  camera.position.set(0, 0, 6.4);

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-3, 4, 5);
  const rim = new THREE.DirectionalLight(0xff8a50, 4);
  rim.position.set(4, 1.5, -3);
  const under = new THREE.PointLight(0xff5b2e, 8, 10);
  under.position.set(0, -2.2, 2.2);
  scene.add(key, rim, under);

  // Build the mark from the same paths as the flat logo.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}">${MARK_INK.map((d) => `<path fill="#141218" d="${d}"/>`).join("")}${MARK_FOLDS.map((d) => `<path fill="${MARK_EMBER}" d="${d}"/>`).join("")}</svg>`;
  const parsed = new SVGLoader().parse(svg);
  const ink = new THREE.MeshPhysicalMaterial({ color: 0x2c2931, metalness: 0.92, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.18 });
  const fold = new THREE.MeshPhysicalMaterial({
    color: 0xff4a1a,
    emissive: 0xe0300a,
    emissiveIntensity: 0.28,
    metalness: 0.1,
    roughness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  const inner = new THREE.Group();
  const geometries: InstanceType<typeof THREE.ExtrudeGeometry>[] = [];
  for (const path of parsed.paths) {
    const isFold = (path.userData?.style as { fill?: string } | undefined)?.fill !== "#141218";
    const geometry = new THREE.ExtrudeGeometry(path.toShapes(), {
      depth: 110,
      bevelEnabled: true,
      bevelThickness: 12,
      bevelSize: 7,
      bevelSegments: 4,
      curveSegments: 10,
    });
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, isFold ? fold : ink);
    // Folds sit just proud of the ribbon so they read as the turned-over face.
    mesh.position.z = isFold ? 16 : 0;
    inner.add(mesh);
  }
  const box = new THREE.Box3().setFromObject(inner);
  const centre = box.getCenter(new THREE.Vector3());
  inner.position.set(-centre.x, -centre.y, -centre.z);
  const scale = 2.3 / (box.max.x - box.min.x);
  const flip = new THREE.Group();
  flip.scale.set(scale, -scale, scale);
  flip.add(inner);
  const spin = new THREE.Group();
  spin.add(flip);
  scene.add(spin);

  const resize = () => {
    const { width, height } = el.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  const sized = new ResizeObserver(resize);
  sized.observe(el);

  const aim = { x: 0, y: 0 };
  const look = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    aim.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
    aim.y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
  };

  const pose = (t: number) => {
    const intro = Math.min(1, t / 1.8);
    const eased = 1 - Math.pow(1 - intro, 4);
    look.x += (aim.x - look.x) * 0.05;
    look.y += (aim.y - look.y) * 0.05;
    spin.rotation.y = (1 - eased) * -Math.PI * 1.25 + Math.sin(t * 0.55) * 0.38 - 0.18 + look.x * 0.45;
    spin.rotation.x = Math.sin(t * 0.4) * 0.07 - 0.06 + look.y * 0.3;
    spin.rotation.z = Math.sin(t * 0.3) * 0.03;
    spin.position.y = Math.sin(t * 1.05) * 0.06;
    spin.scale.setScalar(0.72 + 0.28 * eased);
    under.intensity = 7 + Math.sin(t * 1.6) * 1.5;
  };

  let frame = 0;
  let visible = true;
  const startedAt = performance.now();
  const tick = (now: number) => {
    pose((now - startedAt) / 1000);
    renderer.render(scene, camera);
    frame = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
  };
  const resume = () => {
    if (!frame && visible && !document.hidden && !reduce) frame = requestAnimationFrame(tick);
  };

  if (reduce) {
    spin.rotation.set(-0.06, -0.3, 0);
    renderer.render(scene, camera);
  } else {
    frame = requestAnimationFrame(tick);
    window.addEventListener("pointermove", onPointer, { passive: true });
  }
  const onScreen = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    resume();
  });
  onScreen.observe(el);
  document.addEventListener("visibilitychange", resume);

  requestAnimationFrame(() => {
    canvas.style.opacity = "1";
    el.dataset.ready = "";
  });

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onPointer);
    document.removeEventListener("visibilitychange", resume);
    onScreen.disconnect();
    sized.disconnect();
    for (const g of geometries) g.dispose();
    ink.dispose();
    fold.dispose();
    env.dispose();
    pmrem.dispose();
    room.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
