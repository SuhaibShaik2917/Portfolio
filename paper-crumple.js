// ============================================================
// PaperCrumple — vanilla JS + Three.js
// React Bits physics ported to vanilla. Contact info rendered
// on the paper texture. Drag to crumple, releases to restore.
// Overlay links stay clickable.
// ============================================================

import * as THREE from 'three';

// ============================================================
//  CONTACT INFO — EDIT HERE
// ============================================================
const CONTACT = {
    label:    'UPLINK // OPEN CHANNEL',
    name:     'S. Suhaib',
    role:     'Neural Architect',
    items: [
        { key: 'EMAIL',    value: 'suhaibshaik.it@gmail.com' },
        { key: 'LINKEDIN', value: '/in/shaik-suhaib-a3aa5b1b2' },
        { key: 'GITHUB',   value: 'SuhaibShaik2917' }
    ],
    footer:   'KURNOOL, AP  ·  2026'
};

// ============================================================
//  Contact paper texture — canvas → THREE texture
// ============================================================
function createContactTexture() {
    const W = 1024;
    const H = 1280;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f4f0e8';
    ctx.fillRect(0, 0, W, H);

    const vg = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.85);
    vg.addColorStop(0, 'rgba(255,255,255,0.0)');
    vg.addColorStop(1, 'rgba(120,110,90,0.12)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(10,10,10,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(60, 60, W - 120, H - 120);

    ctx.fillStyle = '#3d3d3d';
    ctx.font = '500 26px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(CONTACT.label, 110, 120);

    ctx.fillStyle = '#0a0a0a';
    ctx.font = '700 96px "Inter", sans-serif';
    ctx.fillText(CONTACT.name, 110, 210);

    ctx.fillStyle = '#4a4a4a';
    ctx.font = '500 30px "JetBrains Mono", monospace';
    ctx.fillText(CONTACT.role.toUpperCase(), 112, 330);

    ctx.strokeStyle = 'rgba(10,10,10,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(110, 410);
    ctx.lineTo(W - 110, 410);
    ctx.stroke();

    let y = 480;
    const rowGap = 145;
    for (const item of CONTACT.items) {
        ctx.fillStyle = '#7a7a7a';
        ctx.font = '500 24px "JetBrains Mono", monospace';
        ctx.fillText(item.key, 110, y);

        ctx.fillStyle = '#0a0a0a';
        ctx.font = '600 40px "Inter", sans-serif';
        ctx.fillText(item.value, 110, y + 42);
        y += rowGap;
    }

    ctx.fillStyle = '#7a7a7a';
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillText(CONTACT.footer, 110, H - 130);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(10,10,10,0.35)';
    ctx.font = '500 22px "JetBrains Mono", monospace';
    ctx.fillText('◆', W - 110, 120);
    ctx.textAlign = 'left';

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
}

// ============================================================
//  Math helpers + spring
// ============================================================
const spring = (value = 0) => ({ value, target: value, velocity: 0 });
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const finite = (v, fallback) => (Number.isFinite(v) ? v : fallback);

function advance(s, dt, duration, instant) {
    if (instant || duration <= 0) {
        s.value = s.target;
        s.velocity = 0;
        return false;
    }
    const omega = 8 / Math.max(0.06, duration);
    const offset = s.value - s.target;
    const term = s.velocity + omega * offset;
    const decay = Math.exp(-omega * dt);
    s.value = s.target + (offset + term * dt) * decay;
    s.velocity = (s.velocity - omega * term * dt) * decay;
    if (Math.abs(s.value - s.target) < 0.0001 && Math.abs(s.velocity) < 0.001) {
        s.value = s.target;
        s.velocity = 0;
        return false;
    }
    return true;
}

function randomSource(seed) {
    let value = seed | 0;
    return () => {
        value |= 0;
        value = (value + 0x6d2b79f5) | 0;
        let n = Math.imul(value ^ (value >>> 15), 1 | value);
        n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
        return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
}

// ============================================================
//  Paper physics solver — direct port of React Bits
// ============================================================
function createPaperPath(rest, triangles, shortSide, density, sharpness, depth, seed) {
    const count = rest.length / 3;
    const points = Float64Array.from(rest);
    const previous = Float64Array.from(rest);
    const before = Float64Array.from(rest);
    const edges = [];
    const hinges = [];
    const adjacency = new Map();
    const random = randomSource(seed);

    const guides = Array.from({ length: density }, () => {
        const angle = random() * Math.PI * 2;
        return {
            x: Math.cos(angle),
            y: Math.sin(angle),
            phase: random() * Math.PI * 2,
            weight: random() * 0.6 + 0.4
        };
    });

    for (let t = 0; t < triangles.length; t += 3) {
        for (let k = 0; k < 3; k++) {
            const a = triangles[t + k];
            const b = triangles[t + ((k + 1) % 3)];
            const opposite = triangles[t + ((k + 2) % 3)];
            const key = Math.min(a, b) * count + Math.max(a, b);
            const other = adjacency.get(key);

            if (!other) {
                adjacency.set(key, { a, b, opposite });
                const length = Math.hypot(
                    rest[a * 3] - rest[b * 3],
                    rest[a * 3 + 1] - rest[b * 3 + 1]
                );
                edges.push(a * 3, b * 3, length);
            } else {
                const c = other.opposite * 3;
                const d = opposite * 3;
                const length = Math.hypot(rest[c] - rest[d], rest[c + 1] - rest[d + 1]);
                const mx = (rest[c] + rest[d]) * 0.5;
                const my = (rest[c + 1] + rest[d + 1]) * 0.5;
                let weakness = 0;
                for (const guide of guides) {
                    const distance = Math.abs(
                        Math.sin(((mx * guide.x + my * guide.y) / shortSide) * 4 + guide.phase)
                    );
                    weakness = Math.max(weakness, Math.exp(-distance * distance * 80) * guide.weight);
                }
                hinges.push(c, d, length, 0.12 + (1 - weakness) * 0.75);
            }
        }
    }

    const spacing = Math.sqrt((shortSide * shortSide) / count);
    const thickness = shortSide * 0.008;
    const samples = [rest.slice()];
    const frameCount = 64;
    const stepsPerFrame = 3;
    const totalSteps = frameCount * stepsPerFrame;

    let initialRadius = 0;
    for (let i = 0; i < rest.length; i += 3) {
        initialRadius = Math.max(
            initialRadius,
            Math.hypot(rest[i] / 0.94, rest[i + 1] / 1.02)
        );
    }
    initialRadius *= 1.02;

    function constrain(list, stride, stiffness, reverse) {
        for (let n = 0; n < list.length; n += stride) {
            const edge = reverse ? list.length - stride - n : n;
            const a = list[edge];
            const b = list[edge + 1];
            const dx = points[b] - points[a];
            const dy = points[b + 1] - points[a + 1];
            const dz = points[b + 2] - points[a + 2];
            const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (length < 0.000001) continue;
            const weight = stride === 4 ? list[edge + 3] : 1;
            const amount = (1 - list[edge + 2] / length) * 0.5 * stiffness * weight;
            points[a] += dx * amount;
            points[b] -= dx * amount;
            points[a + 1] += dy * amount;
            points[b + 1] -= dy * amount;
            points[a + 2] += dz * amount;
            points[b + 2] -= dz * amount;
        }
    }

    function separateLayers() {
        const margin = thickness * 2;
        for (let t = 0; t < triangles.length; t += 3) {
            const a = triangles[t] * 3;
            const b = triangles[t + 1] * 3;
            const c = triangles[t + 2] * 3;
            const ax = points[a], ay = points[a + 1], az = points[a + 2];
            const bx = points[b] - ax, by = points[b + 1] - ay, bz = points[b + 2] - az;
            const cx = points[c] - ax, cy = points[c + 1] - ay, cz = points[c + 2] - az;
            let nx = by * cz - bz * cy;
            let ny = bz * cx - bx * cz;
            let nz = bx * cy - by * cx;
            const length = Math.hypot(nx, ny, nz);
            if (length < 0.0000001) continue;
            nx /= length; ny /= length; nz /= length;

            const minX = Math.min(ax, points[b], points[c]) - margin;
            const maxX = Math.max(ax, points[b], points[c]) + margin;
            const minY = Math.min(ay, points[b + 1], points[c + 1]) - margin;
            const maxY = Math.max(ay, points[b + 1], points[c + 1]) + margin;
            const minZ = Math.min(az, points[b + 2], points[c + 2]) - margin;
            const maxZ = Math.max(az, points[b + 2], points[c + 2]) + margin;

            const bb = bx * bx + by * by + bz * bz;
            const cc = cx * cx + cy * cy + cz * cz;
            const bc = bx * cx + by * cy + bz * cz;
            const determinant = bb * cc - bc * bc;
            if (determinant < 0.0000000001) continue;

            for (let p = 0; p < points.length; p += 3) {
                if (p === a || p === b || p === c) continue;
                if (points[p] < minX || points[p] > maxX ||
                    points[p + 1] < minY || points[p + 1] > maxY ||
                    points[p + 2] < minZ || points[p + 2] > maxZ) continue;

                const rx = rest[p] - (rest[a] + rest[b] + rest[c]) / 3;
                const ry = rest[p + 1] - (rest[a + 1] + rest[b + 1] + rest[c + 1]) / 3;
                if (rx * rx + ry * ry < spacing * spacing * 6) continue;

                const dx = points[p] - ax;
                const dy = points[p + 1] - ay;
                const dz = points[p + 2] - az;
                const distance = dx * nx + dy * ny + dz * nz;
                const previousDistance =
                    (before[p] - before[a]) * nx +
                    (before[p + 1] - before[a + 1]) * ny +
                    (before[p + 2] - before[a + 2]) * nz;
                const side = previousDistance >= 0 ? 1 : -1;
                if (distance * side >= thickness || Math.abs(distance) > margin) continue;

                const pb = dx * bx + dy * by + dz * bz;
                const pc = dx * cx + dy * cy + dz * cz;
                const u = (cc * pb - bc * pc) / determinant;
                const v = (bb * pc - bc * pb) / determinant;
                if (u < 0 || v < 0 || u + v > 1) continue;

                const w = 1 - u - v;
                const correction = (thickness * side - distance) / (1 + w * w + u * u + v * v);

                for (let axis = 0; axis < 3; axis++) {
                    const normal = axis === 0 ? nx : axis === 1 ? ny : nz;
                    const movement = normal * correction;
                    points[p + axis] += movement;
                    points[a + axis] -= movement * w;
                    points[b + axis] -= movement * u;
                    points[c + axis] -= movement * v;
                }
            }
        }
    }

    for (let step = 1; step <= totalSteps; step++) {
        const progress = step / totalSteps;
        const compression = progress * progress * (3 - 2 * progress);
        const radius = initialRadius * (1 - compression) +
            shortSide * (0.19 - depth * 0.025) * compression;

        before.set(points);

        for (let i = 0; i < points.length; i += 3) {
            const x = rest[i] / shortSide;
            const y = rest[i + 1] / shortSide;
            let buckle = 0;
            for (const guide of guides) {
                buckle += Math.sin((x * guide.x + y * guide.y) * 5 + guide.phase) * guide.weight;
            }
            for (let axis = 0; axis < 3; axis++) {
                const velocity = (points[i + axis] - previous[i + axis]) * 0.55;
                previous[i + axis] = points[i + axis];
                points[i + axis] += clamp(velocity, -spacing * 0.15, spacing * 0.15);
            }
            points[i + 2] += (buckle / density) * shortSide * 0.0007 * Math.sin(progress * Math.PI);
        }

        for (let pass = 0; pass < 18; pass++) {
            constrain(hinges, 4, 0.45 * (1 - sharpness * 0.4), pass % 2 === 0);
            for (let i = 0; i < points.length; i += 3) {
                const x = points[i] / 0.94;
                const y = points[i + 1] / 1.02;
                const z = points[i + 2] / 0.86;
                const distance = Math.hypot(x, y, z);
                if (distance > radius) {
                    const push = (1 - radius / distance) * 0.55;
                    points[i] -= points[i] * push;
                    points[i + 1] -= points[i + 1] * push;
                    points[i + 2] -= points[i + 2] * push;
                }
            }
            constrain(edges, 3, 1, pass % 2 !== 0);
            if (pass === 8 || pass === 17) separateLayers();
        }

        for (let h = 0; h < hinges.length; h += 4) {
            const a = hinges[h];
            const b = hinges[h + 1];
            const length = Math.hypot(
                points[a] - points[b],
                points[a + 1] - points[b + 1],
                points[a + 2] - points[b + 2]
            );
            if (length < hinges[h + 2] * 0.86) {
                hinges[h + 2] += (length - hinges[h + 2]) * 0.12;
            }
        }

        if (step % stepsPerFrame === 0) samples.push(Float32Array.from(points));
    }

    // Build "creased" residual state
    const folded = Float64Array.from(points);
    for (let step = 1; step <= 80; step++) {
        const t = step / 80;
        const unfold = t * t * (3 - 2 * t);
        for (let pass = 0; pass < 12; pass++) {
            for (let i = 0; i < points.length; i++) {
                const target = folded[i] + (rest[i] - folded[i]) * unfold;
                points[i] += (target - points[i]) * (i % 3 === 2 ? 0.04 : 0.22);
            }
            constrain(hinges, 4, 0.7, pass % 2 === 0);
            constrain(edges, 3, 1, pass % 2 !== 0);
        }
    }
    const creased = Float32Array.from(points);

    return { samples, creased };
}

// ============================================================
//  Init
// ============================================================
function initPaperCrumple(rootEl, opts = {}) {
    const paperWidth = Math.max(1, finite(opts.width, 400));
    const paperHeight = Math.max(1, finite(opts.height, 500));
    const aspect = paperHeight / paperWidth;
    const shortSide = Math.min(1, aspect);
    const detail = clamp(finite(opts.detail, 64), 32, 96);
    const resolution = Math.round(clamp(detail / 4, 8, 24));
    const columns = Math.max(8, Math.round(resolution / Math.max(1, aspect)));
    const rows = Math.max(8, Math.round(resolution * Math.min(1, aspect)));
    const foldTotal = Math.round(clamp(finite(opts.foldCount, 6), 3, 16));
    const sharpness = clamp(finite(opts.foldSharpness, 0.6), 0, 1);
    const depth = clamp(finite(opts.wrinkleDepth, 0.65), 0, 2);
    const seed = finite(opts.seed, 7);
    const draggable = opts.draggable !== false;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // -------- canvas + renderer --------
    const canvas = document.createElement('canvas');
    canvas.className = 'paper-crumple-canvas';
    canvas.style.cssText = 'display:block;position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    rootEl.appendChild(canvas);

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({
            canvas, antialias: true, alpha: true, powerPreference: 'low-power'
        });
    } catch (err) {
        console.error('WebGL unavailable:', err);
        rootEl.style.background = 'linear-gradient(135deg, #f4f0e8, #ddd2b8)';
        return null;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // -------- geometry --------
    const count = (columns + 1) * (rows + 1);
    const original = new Float32Array(count * 3);
    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const indices = [];
    const rng = randomSource(seed);

    for (let row = 0; row <= rows; row++) {
        for (let col = 0; col <= columns; col++) {
            const index = row * (columns + 1) + col;
            const u = (col + (col > 0 && col < columns ? (rng() - 0.5) * 0.5 : 0)) / columns;
            const v = (row + (row > 0 && row < rows ? (rng() - 0.5) * 0.5 : 0)) / rows;
            const x = u - 0.5;
            const y = (v - 0.5) * aspect;
            original[index * 3] = x;
            original[index * 3 + 1] = y;
            uvs[index * 2] = u;
            uvs[index * 2 + 1] = v;
            if (col < columns && row < rows) {
                const a = index;
                const b = index + 1;
                const c = index + columns + 1;
                const d = c + 1;
                if (rng() > 0.5) indices.push(a, b, d, a, d, c);
                else indices.push(a, b, c, b, d, c);
            }
        }
    }

    // -------- paper path --------
    const paperPath = createPaperPath(original, indices, shortSide, foldTotal, sharpness, depth, seed);

    // -------- render geometry (expanded triangles) --------
    const renderPositions = new Float32Array(indices.length * 3);
    const renderNormals = new Float32Array(indices.length * 3);
    const renderUvs = new Float32Array(indices.length * 2);
    const faceNormals = new Float32Array(indices.length);
    const incidentFaces = Array.from({ length: count }, () => []);

    for (let i = 0; i < indices.length; i++) {
        renderUvs[i * 2] = uvs[indices[i] * 2];
        renderUvs[i * 2 + 1] = uvs[indices[i] * 2 + 1];
        incidentFaces[indices[i]].push(Math.floor(i / 3) * 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(renderPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(renderNormals, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv', new THREE.BufferAttribute(renderUvs, 2));

    // -------- paper grain bump map --------
    const grainData = new Uint8Array(128 * 128 * 4);
    for (let i = 0; i < grainData.length; i += 4) {
        const value = 100 + Math.floor(rng() * 155);
        grainData[i] = grainData[i + 1] = grainData[i + 2] = value;
        grainData[i + 3] = 255;
    }
    const grain = new THREE.DataTexture(grainData, 128, 128);
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    grain.repeat.set(5, 5 * aspect);
    grain.magFilter = THREE.LinearFilter;
    grain.minFilter = THREE.LinearFilter;
    grain.needsUpdate = true;

    // -------- materials --------
    const paperColor = opts.paperColor || '#f4f0e8';
    const materialOptions = {
        roughness: clamp(finite(opts.roughness, 0.92), 0, 1),
        metalness: 0,
        bumpMap: grain,
        bumpScale: clamp(finite(opts.paperTexture, 0.08), 0, 1) * 0.32,
        alphaTest: 0.04,
        alphaToCoverage: true,
        flatShading: false
    };

    const frontMaterial = new THREE.MeshStandardMaterial({ ...materialOptions, side: THREE.FrontSide });
    const backMaterial  = new THREE.MeshStandardMaterial({
        ...materialOptions,
        side: THREE.BackSide,
        color: paperColor
    });

    // -------- front/back pair --------
    const sheet = new THREE.Group();
    const front = new THREE.Mesh(geometry, frontMaterial);
    const back = new THREE.Mesh(geometry, backMaterial);
    front.castShadow = true;
    front.receiveShadow = true;
    back.receiveShadow = true;
    sheet.add(front, back);

    // -------- scene --------
    const scene = new THREE.Scene();
    scene.add(sheet);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);

    const ambient = new THREE.HemisphereLight(0xffffff, 0xa4a0b0, 1.35);
    scene.add(ambient);

    const lightIntensity = Math.max(0, finite(opts.lightIntensity, 1.8));
    const lightAngleDeg = finite(opts.lightAngle, -35);
    const light = new THREE.DirectionalLight(0xfffaf0, lightIntensity);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0002;
    light.shadow.normalBias = 0.6;
    light.shadow.radius = 3;
    scene.add(light, light.target);

    const floorGeometry = new THREE.PlaneGeometry(1, 1);
    const floorMaterial = new THREE.ShadowMaterial({
        opacity: clamp(finite(opts.shadowOpacity, 0.08), 0, 1),
        depthWrite: false
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.receiveShadow = true;
    scene.add(floor);

    // -------- texture --------
    const contactTexture = createContactTexture();
    frontMaterial.map = contactTexture;
    backMaterial.map = contactTexture;
    frontMaterial.needsUpdate = true;
    backMaterial.needsUpdate = true;

    // -------- springs --------
    const amount = spring();
    const memory = spring();
    const posX = spring();
    const posY = spring();
    const tiltX = spring();
    const tiltY = spring();
    const springs = [amount, memory, posX, posY, tiltX, tiltY];

    // -------- raycasting for drag grip --------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const anchor = new THREE.Vector3();
    const world = new THREE.Vector3();
    const corner = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const weights = new THREE.Vector3(1, 0, 0);

    let gripIndices = [Math.floor(count / 2), 0, 0];
    let viewportWidth = 1;
    let viewportHeight = 1;
    let scale = paperWidth;

    let pointerX = 0, pointerY = 0;
    let lastX = 0, lastY = 0, lastMove = 0;
    let speedX = 0, speedY = 0;

    let held = false;
    let pointerId = null;
    let peak = 0;
    let disposed = false;
    let ready = false;
    let inView = true;
    let frame = 0;
    let lastTime = 0;
    let prevAmount = -1;
    let prevMemory = -1;

    const crumpleAmount = clamp(finite(opts.crumpleAmount, 0.9), 0, 1);
    const crumpleDuration = finite(opts.crumpleDuration, 0.55);
    const releaseDuration = finite(opts.releaseDuration, 0.4);

    // -------- deform --------
    function deform() {
        if (amount.value === prevAmount && memory.value === prevMemory) return;
        prevAmount = amount.value;
        prevMemory = memory.value;

        const fold = clamp(amount.value, 0, 1);
        const f = fold * (paperPath.samples.length - 1);
        const lower = Math.floor(f);
        const upper = Math.min(lower + 1, paperPath.samples.length - 1);
        const mix = f - lower;
        const from = paperPath.samples[lower];
        const to = paperPath.samples[upper];

        for (let i = 0; i < positions.length; i++) {
            positions[i] = from[i] + (to[i] - from[i]) * mix;
            positions[i] += (paperPath.creased[i] - original[i]) * memory.value * (1 - fold);
        }

        // Face normals
        for (let face = 0; face < indices.length; face += 3) {
            const ia = indices[face] * 3;
            const ib = indices[face + 1] * 3;
            const ic = indices[face + 2] * 3;
            const bx = positions[ib] - positions[ia];
            const by = positions[ib + 1] - positions[ia + 1];
            const bz = positions[ib + 2] - positions[ia + 2];
            const cx = positions[ic] - positions[ia];
            const cy = positions[ic + 1] - positions[ia + 1];
            const cz = positions[ic + 2] - positions[ia + 2];
            const nx = by * cz - bz * cy;
            const ny = bz * cx - bx * cz;
            const nz = bx * cy - by * cx;
            const length = Math.hypot(nx, ny, nz) || 1;
            faceNormals[face] = nx / length;
            faceNormals[face + 1] = ny / length;
            faceNormals[face + 2] = nz / length;
        }

        // Smooth vertex normals from adjacent faces
        for (let i = 0; i < indices.length; i++) {
            const source = indices[i] * 3;
            const face = Math.floor(i / 3) * 3;
            let nx = 0, ny = 0, nz = 0;
            for (const neighbor of incidentFaces[indices[i]]) {
                const dot =
                    faceNormals[face] * faceNormals[neighbor] +
                    faceNormals[face + 1] * faceNormals[neighbor + 1] +
                    faceNormals[face + 2] * faceNormals[neighbor + 2];
                const weight = THREE.MathUtils.smoothstep(dot, 0.88 - (1 - sharpness) * 0.18, 0.98);
                nx += faceNormals[neighbor] * weight;
                ny += faceNormals[neighbor + 1] * weight;
                nz += faceNormals[neighbor + 2] * weight;
            }
            const length = Math.hypot(nx, ny, nz) || 1;
            renderPositions[i * 3] = positions[source];
            renderPositions[i * 3 + 1] = positions[source + 1];
            renderPositions[i * 3 + 2] = positions[source + 2];
            renderNormals[i * 3] = nx / length;
            renderNormals[i * 3 + 1] = ny / length;
            renderNormals[i * 3 + 2] = nz / length;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.normal.needsUpdate = true;
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
    }

    // -------- render loop --------
    function render(time) {
        frame = 0;
        if (disposed || !ready || !inView || document.hidden) return;

        const dt = lastTime ? Math.min(0.04, (time - lastTime) / 1000) : 1 / 60;
        lastTime = time;

        let moving = false;
        const duration = held ? crumpleDuration : releaseDuration;
        for (const s of springs) {
            const d = (s === amount || s === memory) ? duration : 0.42;
            moving = advance(s, dt, d, reduceMotion) || moving;
        }

        peak = Math.max(peak, amount.value);
        deform();

        sheet.rotation.set(tiltX.value, tiltY.value, 0);

        // Drag: move grabbed material point with pointer
        if (held && draggable) {
            const attribute = geometry.attributes.position;
            anchor.set(0, 0, 0);
            for (let i = 0; i < 3; i++) {
                a.fromBufferAttribute(attribute, gripIndices[i]);
                anchor.addScaledVector(a, weights.getComponent(i));
            }
            anchor.multiplyScalar(scale).applyEuler(sheet.rotation);
            plane.constant = -anchor.z;

            const rect = rootEl.getBoundingClientRect();
            pointer.set(
                (pointerX / viewportWidth) * 2 - 1,
                1 - (pointerY / viewportHeight) * 2
            );
            raycaster.setFromCamera(pointer, camera);

            if (raycaster.ray.intersectPlane(plane, world)) {
                posX.value = posX.target = world.x - anchor.x;
                posY.value = posY.target = world.y - anchor.y;
                posX.velocity = posY.velocity = 0;
            }
        }

        sheet.position.set(posX.value, posY.value, 0);
        sheet.updateMatrixWorld(true);

        // Position shadow floor below paper
        const bounds = geometry.boundingBox;
        if (bounds) {
            let backZ = Infinity;
            for (let i = 0; i < 8; i++) {
                corner.set(
                    i & 1 ? bounds.max.x : bounds.min.x,
                    i & 2 ? bounds.max.y : bounds.min.y,
                    i & 4 ? bounds.max.z : bounds.min.z
                );
                corner.applyMatrix4(sheet.matrixWorld);
                backZ = Math.min(backZ, corner.z);
            }
            floor.position.z = backZ - scale * shortSide * 0.08;
        }

        renderer.render(scene, camera);

        if (moving) wake();
    }

    function wake() {
        if (!frame && !disposed && ready && inView && !document.hidden) {
            frame = requestAnimationFrame(render);
        }
    }

    // -------- resize --------
    function resize() {
        const rect = rootEl.getBoundingClientRect();
        viewportWidth = Math.max(1, rect.width);
        viewportHeight = Math.max(1, rect.height);

        scale = paperWidth * Math.min(
            1,
            Math.max(1, viewportWidth - 48) / paperWidth,
            Math.max(1, viewportHeight - 48) / paperHeight
        );

        sheet.scale.setScalar(scale);

        camera.aspect = viewportWidth / viewportHeight;
        camera.position.z = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(viewportWidth, viewportHeight, false);

        const reach = Math.max(viewportWidth, viewportHeight);
        const angle = THREE.MathUtils.degToRad(lightAngleDeg);
        light.position.set(Math.sin(angle) * reach, Math.cos(angle) * reach, reach * 4);
        light.shadow.camera.left = light.shadow.camera.bottom = -reach;
        light.shadow.camera.right = light.shadow.camera.top = reach;
        light.shadow.camera.near = 1;
        light.shadow.camera.far = reach * 6;
        light.shadow.camera.updateProjectionMatrix();

        floor.position.z = -scale * shortSide * 0.12;
        floor.scale.set(viewportWidth * 4, viewportHeight * 4, 1);

        if (!held) {
            const limitX = Math.max(0, (viewportWidth - scale) / 2 - 16);
            const limitY = Math.max(0, (viewportHeight - scale * aspect) / 2 - 16);
            posX.value = posX.target = clamp(posX.value, -limitX, limitX);
            posY.value = posY.target = clamp(posY.value, -limitY, limitY);
        }

        wake();
    }

    // -------- pointer handlers --------
    function onPointerDown(e) {
        if (disposed || !ready || held) return;
        if (e.button !== 0 && e.pointerType === 'mouse') return;

        // Bail if user clicked an overlay link
        if (e.target && e.target.closest && e.target.closest('.crumple-link')) return;

        const rect = rootEl.getBoundingClientRect();
        pointerX = lastX = e.clientX - rect.left;
        pointerY = lastY = e.clientY - rect.top;

        pointer.set(
            (pointerX / viewportWidth) * 2 - 1,
            1 - (pointerY / viewportHeight) * 2
        );
        raycaster.setFromCamera(pointer, camera);
        sheet.updateMatrixWorld(true);

        const hit = raycaster.intersectObjects([front, back], false)[0];
        if (!hit || !hit.face) return;

        e.preventDefault();
        held = true;
        peak = amount.value;
        amount.target = crumpleAmount;

        gripIndices = [hit.face.a, hit.face.b, hit.face.c];
        const attr = geometry.attributes.position;
        a.fromBufferAttribute(attr, hit.face.a);
        b.fromBufferAttribute(attr, hit.face.b);
        c.fromBufferAttribute(attr, hit.face.c);
        THREE.Triangle.getBarycoord(sheet.worldToLocal(hit.point.clone()), a, b, c, weights);

        pointerId = e.pointerId;
        speedX = speedY = 0;
        lastMove = performance.now();
        try { rootEl.setPointerCapture(e.pointerId); } catch (err) {}

        rootEl.style.cursor = 'grabbing';
        rootEl.classList.add('is-crumpling');
        wake();
    }

    function onPointerMove(e) {
        if (!held || e.pointerId !== pointerId || !draggable) return;
        const rect = rootEl.getBoundingClientRect();
        const now = performance.now();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const dt = Math.max(0.008, (now - lastMove) / 1000);

        speedX = (x - lastX) / dt;
        speedY = (y - lastY) / dt;
        lastX = x;
        lastY = y;
        lastMove = now;

        pointerX = clamp(x, 12, viewportWidth - 12);
        pointerY = clamp(y, 12, viewportHeight - 12);

        const maxTilt = reduceMotion ? 0 : THREE.MathUtils.degToRad(10);
        tiltX.target = clamp(speedY / 1800, -1, 1) * maxTilt;
        tiltY.target = clamp(speedX / 1800, -1, 1) * maxTilt;

        wake();
    }

    function onPointerUp(e) {
        if (!held || e.pointerId !== pointerId) return;
        held = false;
        pointerId = null;

        amount.target = 0;
        memory.target = 0;
        tiltX.target = 0;
        tiltY.target = 0;
        posX.target = 0;
        posY.target = 0;

        rootEl.style.cursor = 'grab';
        try { rootEl.releasePointerCapture(e.pointerId); } catch (err) {}
        wake();
    }

    rootEl.style.cursor = 'grab';
    rootEl.style.touchAction = 'none';
    rootEl.addEventListener('pointerdown', onPointerDown);
    rootEl.addEventListener('pointermove', onPointerMove);
    rootEl.addEventListener('pointerup', onPointerUp);
    rootEl.addEventListener('pointercancel', onPointerUp);

    window.addEventListener('resize', resize);

    const io = new IntersectionObserver(entries => {
        inView = entries[0].isIntersecting;
        lastTime = 0;
        if (!inView) {
            // Fully reset when leaving view
            held = false;
            pointerId = null;
            amount.value = amount.target = 0;
            memory.value = memory.target = 0;
            posX.value = posX.target = 0;
            posY.value = posY.target = 0;
            tiltX.value = tiltX.target = 0;
            tiltY.value = tiltY.target = 0;
            rootEl.classList.remove('is-crumpling');
        }
        wake();
    }, { threshold: 0 });
    io.observe(rootEl);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            lastTime = 0;
            wake();
        }
    });

    // -------- ready --------
    deform();
    resize();
    ready = true;
    wake();

    // -------- destroy --------
    return {
        destroy() {
            disposed = true;
            cancelAnimationFrame(frame);
            if (pointerId !== null && rootEl.hasPointerCapture(pointerId)) {
                try { rootEl.releasePointerCapture(pointerId); } catch (err) {}
            }
            io.disconnect();
            window.removeEventListener('resize', resize);
            rootEl.removeEventListener('pointerdown', onPointerDown);
            rootEl.removeEventListener('pointermove', onPointerMove);
            rootEl.removeEventListener('pointerup', onPointerUp);
            rootEl.removeEventListener('pointercancel', onPointerUp);
            contactTexture.dispose();
            grain.dispose();
            geometry.dispose();
            floorGeometry.dispose();
            frontMaterial.dispose();
            backMaterial.dispose();
            floorMaterial.dispose();
            renderer.dispose();
        }
    };
}

// ============================================================
//  Auto-init
// ============================================================
async function autoInit() {
    const root = document.getElementById('crumpleRoot');
    if (!root || root.dataset.paperInit === '1') return;
    root.dataset.paperInit = '1';

    try { await document.fonts.ready; } catch (e) {}

    root.style.position = 'relative';
    root.style.width = '100%';
    root.style.maxWidth = '720px';
    root.style.margin = '3rem auto 0';
    root.style.height = (parseInt(root.dataset.sceneHeight, 10) || 620) + 'px';
    root.style.overflow = 'hidden';

    initPaperCrumple(root, {
        width:  parseInt(root.dataset.width, 10) || 400,
        height: parseInt(root.dataset.height, 10) || 500,
        lightIntensity: 1.8
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
} else {
    autoInit();
}