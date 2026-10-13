import * as THREE from "three";
import { sceneScale } from "./layout";
import { createContextMuting } from "./focus-materials";
import type { CampusView } from "./markers";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createIntroTimeline,
  smoothProgress,
  createScrollModel,
  type ScrollIntroState,
} from "@scene/scroll";
import { createCameraFlight, type CameraPose } from "../camera-flight";
import { createIslandFlight } from "../floating-island";
import { campusMarkers, facilitySite, type MarkerProjection } from "./markers";
import { createCampusModel } from "./model";
import { createCampusPainting } from "./painting";
import { defaultPalette, type CampusPalette } from "./palette";

export interface CampusSceneOptions {
  palette?: CampusPalette;
  view?: CampusView;
  intro?: boolean;
  autoRotate?: boolean;
  overviewScale?: number;
  screenFraming?: boolean;
  onProject?: (positions: Record<string, MarkerProjection>) => void;
  onBlank?: () => void;
  onProgress?: (value: number) => void;
  onIntroState?: (state: ScrollIntroState) => void;
  onError?: (error: unknown) => void;
}
export interface CampusScene {
  setView: (view: CampusView) => void;
  focus: (id: string) => void;
  restoreFocus: () => void;
  zoom: (factor: number) => void;
  reset: () => void;
  setAutoRotate: (value: boolean) => void;
  setPalette: (palette: CampusPalette) => void;
  setOverviewScale: (value: number) => void;
  dispose: () => void;
}
export function createCampusScene(
  host: HTMLElement,
  options: CampusSceneOptions = {},
): CampusScene {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.domElement.setAttribute(
    "aria-label",
    "知行校园三维沙盘，可拖动旋转、滚轮缩放，或使用下方按钮",
  );
  renderer.domElement.setAttribute("role", "img");
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(),
    paperScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 1, 650);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableRotate = false;
  controls.enableDamping = false;
  controls.minDistance = 120;
  controls.maxDistance = 390;
  controls.minPolarAngle = controls.maxPolarAngle = Math.atan2(
    Math.hypot(24, 89),
    61,
  );
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
  const contextMuting = createContextMuting();
  contextMuting.amount.value = options.view === "safety" ? 1 : 0;
  const frame = new THREE.Group();
  scene.add(frame);
  let focusedId: string | null = null,
    flight: ReturnType<typeof createCameraFlight> | undefined;
  let flightTarget: CameraPose | undefined;
  let islandFlight: ReturnType<typeof createIslandFlight> | undefined;
  let savedOverview: { pose: CameraPose; heading: number } | undefined;
  const pose = (): CameraPose => ({
    target: controls.target.clone(),
    offset: camera.position.clone().sub(controls.target),
  });
  function moveCamera(next: CameraPose) {
    flightTarget = { target: next.target.clone(), offset: next.offset.clone() };
    flight = createCameraFlight(pose(), next);
  }
  function focus(id: string) {
    const site = facilitySite(id);
    if (state !== "ready" || !site) return;
    if (!savedOverview)
      savedOverview = { pose: pose(), heading: frame.rotation.y };
    focusedId = id;
    controls.minDistance = 28;
    frame.updateWorldMatrix(true, false);
    const point = frame.localToWorld(
      new THREE.Vector3(site.x, site.y, site.z).multiplyScalar(sceneScale),
    );
    const distance = site.focusDistance;
    const offset = pose().offset.normalize().multiplyScalar(distance);
    const right = new THREE.Vector3().setFromMatrixColumn(
      camera.matrixWorld,
      0,
    );
    const target = point
      .clone()
      .addScaledVector(
        right,
        host.clientWidth > 900
          ? distance * 0.14
          : host.clientWidth > 650
            ? distance * 0.12
            : 0,
      );
    if (host.clientWidth <= 650)
      target.addScaledVector(
        new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1),
        -13,
      );
    islandFlight = undefined;
    moveCamera({ target, offset });
  }
  function restoreFocus() {
    if (!savedOverview) return;
    focusedId = null;
    pauseRotation();
    islandFlight = createIslandFlight(
      { position: new THREE.Vector3(), heading: frame.rotation.y },
      { position: new THREE.Vector3(), heading: savedOverview.heading },
    );
    moveCamera(savedOverview.pose);
    savedOverview = undefined;
  }
  let model: ReturnType<typeof createCampusModel> | undefined;
  let scroll: ReturnType<typeof createScrollModel> | undefined;
  let painting: THREE.CanvasTexture | undefined;
  let disposed = false,
    ready = false,
    failed = false,
    raf = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  let state: ScrollIntroState = "loading",
    previous = 0,
    elapsed = 0,
    interacting = false;
  let pauseUntil = 0;
  const pauseRotation = () => {
    pauseUntil = performance.now() + 20000;
  };
  let rotate = options.autoRotate ?? true,
    scale = options.overviewScale ?? 1;
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = media.matches;
  const timeline = createIntroTimeline(!!options.intro);
  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 34);
  function stateChanged(value: ScrollIntroState) {
    if (state !== value) {
      state = value;
      options.onIntroState?.(value);
    }
    controls.enabled = value === "ready";
    host.dataset.introState = value;
  }
  function progress(value: number) {
    host.dataset.preparation = String(value);
    options.onProgress?.(value);
  }
  function fail(error: unknown) {
    if (disposed || failed) return;
    failed = true;
    frame.visible = false;
    timeline.fail();
    stateChanged("failed");
    options.onError?.(error);
  }
  function lights(target: THREE.Scene, shadows: boolean) {
    target.add(new THREE.HemisphereLight("#f4f8ff", "#8894a0", 2.1));
    const sun = new THREE.DirectionalLight("#fff9f0", 2.6);
    sun.position.set(-34, 70, 40);
    sun.castShadow = shadows;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -75,
      right: 75,
      top: 75,
      bottom: -75,
      near: 1,
      far: 180,
    });
    sun.shadow.normalBias = 0.15;
    target.add(sun, sun.target);
    return sun;
  }
  const sun = lights(scene, true);
  lights(paperScene, false);
  const scrollAzimuth = options.screenFraming ? Math.atan2(36, 188) : 0;
  let introCameraSettled = false;
  function overviewPose(): CameraPose {
    const phi = controls.minPolarAngle;
    // Increase the island's screen coverage while keeping the paper's front edge
    // only 1.75% below the viewport. Solve target height in camera space.
    const sin = Math.sin(phi),
      cos = Math.cos(phi);
    const edgeSlope =
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.035;
    const distance = Math.max(
      120,
      (-33 * cos + 49 * sin + (33 * sin + 49 * cos) / edgeSlope) * 0.98,
    );
    const targetHeight =
      (edgeSlope * (distance - 49 * sin) - 49 * cos) / (sin - edgeSlope * cos) -
      34;
    const target = new THREE.Vector3(0, targetHeight, 0);
    return {
      target,
      offset: new THREE.Vector3().setFromSpherical(
        new THREE.Spherical(distance, phi, scrollAzimuth),
      ),
    };
  }
  function applyPose(next: CameraPose) {
    controls.target.copy(next.target);
    camera.position.copy(next.target).add(next.offset);
    controls.update();
  }
  function reset() {
    if (options.screenFraming) {
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      applyPose(overviewPose());
      return;
    }
    camera.position.set(36, 119, 188);
    controls.target.set(0, -6, 0);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
  }
  function resize() {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth),
      height = Math.max(1, host.clientHeight),
      aspect = width / height;
    camera.aspect = aspect;
    camera.fov = THREE.MathUtils.radToDeg(
      2 *
        Math.atan(
          Math.tan((34 * Math.PI) / 360) * Math.max(1, 1.22 / aspect) * scale,
        ),
    );
    camera.updateProjectionMatrix();
    const rect = host.getBoundingClientRect();
    renderer.setPixelRatio(
      Math.min(devicePixelRatio, 1.8) * (rect.width / width || 1),
    );
    renderer.setSize(width, height, false);
    if (options.screenFraming && !focusedId && !flight)
      applyPose(overviewPose());
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  reset();
  resize();
  const onStart = () => {
    pauseRotation();
    interacting = true;
  };
  const onEnd = () => {
    pauseRotation();
    interacting = false;
  };
  const pointers = new Map<number, number>();
  let pointerTravel = 0;
  const pointerDown = (event: PointerEvent) => {
    if (state !== "ready" || event.button > 0) return;
    interacting = true;
    pointerTravel = 0;
    flight = undefined;
    flightTarget = undefined;
    islandFlight = undefined;
    pointers.set(event.pointerId, event.clientX);
    renderer.domElement.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (previous === undefined) return;
    pointers.set(event.pointerId, event.clientX);
    pointerTravel += Math.abs(event.clientX - previous);
    if (pointers.size === 1)
      frame.rotation.y += (event.clientX - previous) * 0.006;
  };
  const pointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (!pointers.size) {
      interacting = false;
      pauseRotation();
      if (event.type === "pointerup" && pointerTravel < 5) options.onBlank?.();
    }
  };
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointermove", pointerMove);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  renderer.domElement.addEventListener("pointercancel", pointerUp);
  renderer.domElement.addEventListener("lostpointercapture", pointerUp);
  controls.addEventListener("start", onStart);
  controls.addEventListener("end", onEnd);
  const onMedia = () => {
    reduced = media.matches;
  };
  media.addEventListener("change", onMedia);
  const contextLost = (event: Event) => {
    event.preventDefault();
    fail(new Error("沙盘图形上下文丢失，请刷新重试"));
  };
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  renderer.debug.onShaderError = () => fail(new Error("校园沙盘材质编译失败"));
  function replaceModel(palette: CampusPalette) {
    const next = createCampusModel(palette);
    const nextPainting = createCampusPainting(palette);
    next.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          m.clippingPlanes = [clip];
          contextMuting.attach(m);
        });
      }
    });
    if (model) {
      frame.remove(model.root);
      model.dispose();
    }
    model = next;
    frame.add(model.root);
    if (scroll) scroll.setPainting(nextPainting);
    painting?.dispose();
    painting = nextPainting;
  }
  function render() {
    renderer.autoClear = true;
    renderer.render(paperScene, camera);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = true;
  }
  function animate(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(animate);
    const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
    previous = now;
    if (document.hidden) {
      previous = 0;
      return;
    }
    if (failed) return;
    try {
      const intro = timeline.advance(dt, ready, reduced);
      stateChanged(intro.state);
      if (options.screenFraming && !introCameraSettled) {
        const end = overviewPose();
        const approach =
          reduced || !options.intro ? 1 : smoothProgress((intro.time - 3) / 3);
        applyPose({
          target: new THREE.Vector3(0, -24, 0).lerp(end.target, approach),
          offset: end.offset
            .clone()
            .multiplyScalar(THREE.MathUtils.lerp(1.48 / 0.98, 1, approach)),
        });
        introCameraSettled = intro.state === "ready";
      }
      if (!reduced) elapsed += dt;
      model?.update(elapsed, reduced);
      frame.visible = ready && intro.rise > 0;
      frame.position.y = -57 * (1 - intro.rise);
      clip.constant = intro.rise >= 1 ? 10000 : 34;
      if (flight) {
        const next = flight.advance(dt, reduced);
        controls.target.copy(next.target);
        camera.position.copy(next.target).add(next.offset);
        controls.update();
        if (islandFlight)
          frame.rotation.y = islandFlight.advance(dt, reduced).heading;
        if (next.done) {
          flight = undefined;
          flightTarget = undefined;
          islandFlight = undefined;
          if (!focusedId) controls.minDistance = 120;
        }
      }
      if (
        ready &&
        state === "ready" &&
        rotate &&
        now >= pauseUntil &&
        !focusedId &&
        !flight &&
        !interacting &&
        !reduced
      )
        frame.rotation.y -= dt * 0.035;
      scroll?.update({
        opening: intro.open,
        opacity: ready ? 1 : 0,
        ink: 1,
        time: reduced ? 0 : elapsed,
        azimuth: scrollAzimuth,
      });
      host.dataset.heading = frame.rotation.y.toFixed(4);
      host.dataset.zoom = (
        (options.screenFraming
          ? overviewPose().offset.length()
          : Math.hypot(36, 125, 188)) /
        camera.position.distanceTo(controls.target)
      ).toFixed(3);
      if (options.screenFraming && scroll) {
        scroll.group.rotation.set(0, scrollAzimuth, 0);
        scroll.group.position.set(0, -34, 0);
        scroll.group.updateWorldMatrix(true, false);
        camera.updateMatrixWorld();
        host.dataset.scrollFootprint = JSON.stringify(
          [
            [-58, -49],
            [58, -49],
            [58, 49],
            [-58, 49],
          ].map(([x, z]) =>
            scroll!.group
              .localToWorld(new THREE.Vector3(x, 0, z))
              .project(camera)
              .toArray(),
          ),
        );
      }
      host.dataset.introTime = intro.time.toFixed(3);
      host.dataset.scrollHeading = options.screenFraming
        ? scrollAzimuth.toFixed(5)
        : "0";
      host.dataset.rotationWait = String(
        Math.max(0, Math.ceil((pauseUntil - now) / 1000)),
      );
      host.dataset.focused = focusedId ?? "";
      host.dataset.contextMuted = String(contextMuting.amount.value === 1);
      host.dataset.viewMode = options.view ?? "learning";
      host.dataset.flying = String(!!flight);
      if (options.onProject) {
        frame.updateWorldMatrix(true, false);
        camera.updateMatrixWorld();
        const positions: Record<string, MarkerProjection> = {};
        for (const marker of campusMarkers) {
          const p = facilitySite(marker.id, true)!;
          const v = frame
            .localToWorld(
              new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(sceneScale),
            )
            .project(camera);
          positions[marker.id] = {
            x: ((v.x + 1) * host.clientWidth) / 2,
            y: ((1 - v.y) * host.clientHeight) / 2,
            visible:
              state === "ready" &&
              Math.abs(v.x) < 0.97 &&
              Math.abs(v.y) < 0.95 &&
              Math.abs(v.z) < 1,
          };
        }
        options.onProject(positions);
      }
      host.dataset.camera = camera.position
        .toArray()
        .map((v) => v.toFixed(2))
        .join(",");
      host.dataset.drawCalls = String(renderer.info.render.calls);
      render();
    } catch (error) {
      fail(error);
    }
  }
  // Defer construction so Vue can paint the global loading screen first.
  progress(0);
  options.onIntroState?.("loading");
  controls.enabled = false;
  frame.visible = false;
  timer = setTimeout(() => {
    try {
      if (disposed) return;
      progress(12);
      replaceModel(options.palette ?? defaultPalette);
      progress(65);
      scroll = createScrollModel(paperScene, {
        width: 116,
        depth: 98,
        y: -34,
        painting,
      });
      scroll.update({
        opening: 1,
        opacity: 1,
        ink: 1,
        time: 0,
        azimuth: scrollAzimuth,
      });
      frame.visible = true;
      clip.constant = 10000;
      Promise.all([
        renderer.compileAsync(scene, camera),
        renderer.compileAsync(paperScene, camera),
      ])
        .then(() => {
          if (disposed || failed) return;
          progress(92);
          const target = new THREE.WebGLRenderTarget(64, 64);
          try {
            renderer.setRenderTarget(target);
            render();
            renderer.getContext().finish();
          } finally {
            renderer.setRenderTarget(null);
            target.dispose();
          }
          progress(100);
          host.dataset.prepared = "true";
          frame.visible = false;
          scroll?.update({
            opening: 0.02,
            opacity: 0,
            ink: 1,
            time: 0,
            azimuth: scrollAzimuth,
          });
          // Match the parent's 300ms progress-bar completion before starting the shot.
          timer = setTimeout(() => {
            if (!disposed && !failed) ready = true;
          }, 350);
        })
        .catch(fail);
    } catch (error) {
      fail(error);
    }
  }, 0);
  raf = requestAnimationFrame(animate);
  return {
    setView(view) {
      options.view = view;
      contextMuting.amount.value = view === "safety" ? 1 : 0;
    },
    focus,
    restoreFocus,
    zoom(factor) {
      if (state !== "ready" || !Number.isFinite(factor) || factor <= 0) return;
      pauseRotation();
      if (options.screenFraming) {
        const next = flightTarget ?? pose();
        const offset = next.offset
          .clone()
          .setLength(
            THREE.MathUtils.clamp(
              next.offset.length() / factor,
              focusedId ? 28 : 120,
              controls.maxDistance,
            ),
          );
        moveCamera({ target: next.target.clone(), offset });
        return;
      }
      flight = undefined;
      flightTarget = undefined;
      islandFlight = undefined;
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(
        THREE.MathUtils.clamp(
          offset.length() / factor,
          controls.minDistance,
          controls.maxDistance,
        ),
      );
      camera.position.copy(controls.target).add(offset);
      controls.update();
    },
    reset() {
      if (state !== "ready") return;
      pauseRotation();
      focusedId = null;
      savedOverview = undefined;
      flight = undefined;
      flightTarget = undefined;
      islandFlight = undefined;
      if (options.screenFraming) {
        controls.minDistance = 28;
        islandFlight = createIslandFlight(
          { position: new THREE.Vector3(), heading: frame.rotation.y },
          { position: new THREE.Vector3(), heading: 0 },
        );
        moveCamera(overviewPose());
        return;
      }
      controls.minDistance = 120;
      frame.rotation.y = 0;
      reset();
    },
    setAutoRotate(value) {
      rotate = value;
      if (value) pauseUntil = 0;
    },
    setPalette(palette) {
      if (disposed || failed) return;
      options.palette = palette;
      if (model) {
        try {
          replaceModel(palette);
        } catch (error) {
          fail(error);
        }
      }
    },
    setOverviewScale(value) {
      scale = Number.isFinite(value) && value > 0 ? value : 1;
      resize();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      observer.disconnect();
      media.removeEventListener("change", onMedia);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      for (const [event, listener] of [
        ["pointerdown", pointerDown],
        ["pointermove", pointerMove],
        ["pointerup", pointerUp],
        ["pointercancel", pointerUp],
        ["lostpointercapture", pointerUp],
      ] as const)
        renderer.domElement.removeEventListener(event, listener);
      controls.dispose();
      model?.dispose();
      scroll?.dispose();
      painting?.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
