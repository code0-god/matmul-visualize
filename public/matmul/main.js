const canvas = document.getElementById('scene');
const playPauseButton = document.getElementById('playPause');
const speedSlider = document.getElementById('speed');
const speedValue = document.getElementById('speedValue');
const stepIndicator = document.getElementById('stepIndicator');
const metaInfo = document.getElementById('metaInfo');
const statusEl = document.getElementById('status');
speedValue.textContent = `${Number(speedSlider.value).toFixed(2)}x`;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050608);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
camera.position.set(0, 18, 42);
const clock = new THREE.Clock();

const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(25, 30, 20);
scene.add(dir);

let timeline = [];
let currentFrame = 0;
let isPlaying = true;
let accumulator = 0;
let matrices = {};

const baseColors = {
  A: new THREE.Color(0x3a86ff),
  B: new THREE.Color(0xff006e),
  C: new THREE.Color(0xffc300),
};

const highlightColors = {
  A: new THREE.Color(0x7ed8ff),
  B: new THREE.Color(0xff92b2),
  C: new THREE.Color(0xffed8c),
};

function resizeRenderer() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) {
    return;
  }
  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

async function loadTimeline() {
  try {
    statusEl.textContent = '샘플 데이터를 불러오는 중…';
    const response = await fetch('./sample.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    statusEl.textContent = '타임라인 로드 완료';
    initFromData(data);
  } catch (err) {
    console.error(err);
    statusEl.textContent = `샘플을 불러오지 못했습니다: ${err.message}`;
  }
}

function initFromData(data) {
  Object.values(matrices).forEach((cfg) => scene.remove(cfg.mesh));
  matrices = {};
  timeline = data.timeline || [];
  if (timeline.length === 0) {
    statusEl.textContent = '타임라인이 비어 있습니다.';
    return;
  }

  const layersText = data.meta.layers
    .map((layer) => {
      if (!layer.M) {
        return `${layer.name}`;
      }
      return `${layer.name} — ${layer.M}×${layer.N}×${layer.K}`;
    })
    .join('<br>');

  metaInfo.innerHTML = `
    <div><strong>입력 토큰:</strong> ${data.meta.input_token}</div>
    <div><strong>스케줄:</strong> ${data.meta.schedule}</div>
    <div><strong>레이어:</strong><br>${layersText}</div>
  `;

  matrices = buildMatrices(timeline);
  Object.values(matrices).forEach((cfg) => scene.add(cfg.mesh));
  currentFrame = 0;
  applyFrame(currentFrame);
  stepIndicator.textContent = `Step 1 / ${timeline.length}`;
}

function buildMatrices(frames) {
  const info = {
    A: { rows: 0, cols: 0, tileHeight: 0, tileWidth: 0 },
    B: { rows: 0, cols: 0, tileHeight: 0, tileWidth: 0 },
    C: { rows: 0, cols: 0, tileHeight: 0, tileWidth: 0 },
  };

  frames.forEach((frame) => {
    if (!frame.touch) return;
    ['A', 'B', 'C'].forEach((key) => {
      const rects = frame.touch[key];
      if (!rects) return;
      rects.forEach((rect) => {
        const [row, col, height, width] = rect;
        info[key].rows = Math.max(info[key].rows, row + height);
        info[key].cols = Math.max(info[key].cols, col + width);
        info[key].tileHeight = Math.max(info[key].tileHeight, height);
        info[key].tileWidth = Math.max(info[key].tileWidth, width);
      });
    });
  });

  const result = {};
  const spacing = 1.2;
  const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.3);

  const widths = Object.fromEntries(
    Object.entries(info).map(([key, cfg]) => {
      const rowsTiles = Math.max(1, Math.ceil(cfg.rows / Math.max(1, cfg.tileHeight)));
      const colsTiles = Math.max(1, Math.ceil(cfg.cols / Math.max(1, cfg.tileWidth)));
      return [key, colsTiles * spacing];
    })
  );
  const maxWidth = Math.max(widths.A, widths.B, widths.C);
  const offsets = {
    A: new THREE.Vector3(-maxWidth - 2, 0, 0),
    B: new THREE.Vector3(maxWidth + 2, 0, 0),
    C: new THREE.Vector3(0, 0, 0),
  };
  const dummy = new THREE.Object3D();

  Object.entries(info).forEach(([key, cfg]) => {
    const rowsTiles = Math.max(1, Math.ceil(cfg.rows / Math.max(1, cfg.tileHeight)));
    const colsTiles = Math.max(1, Math.ceil(cfg.cols / Math.max(1, cfg.tileWidth)));
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: baseColors[key] }),
      rowsTiles * colsTiles
    );
    mesh.material.vertexColors = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    let index = 0;
    for (let r = 0; r < rowsTiles; r += 1) {
      for (let c = 0; c < colsTiles; c += 1) {
        dummy.position.set(
          offsets[key].x + (c - colsTiles / 2 + 0.5) * spacing,
          (rowsTiles / 2 - r - 0.5) * spacing,
          offsets[key].z
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        mesh.setColorAt(index, baseColors[key]);
        index += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;

    result[key] = {
      mesh,
      rowsTiles,
      colsTiles,
      tileHeight: Math.max(1, cfg.tileHeight),
      tileWidth: Math.max(1, cfg.tileWidth),
    };
  });

  return result;
}

function resetMatrixColors(key) {
  const cfg = matrices[key];
  if (!cfg) return;
  for (let idx = 0; idx < cfg.rowsTiles * cfg.colsTiles; idx += 1) {
    cfg.mesh.setColorAt(idx, baseColors[key]);
  }
  if (cfg.mesh.instanceColor) {
    cfg.mesh.instanceColor.needsUpdate = true;
  }
}

function highlightRectangles(key, rects) {
  const cfg = matrices[key];
  if (!cfg || !rects) return;
  rects.forEach((rect) => {
    const [row, col, height, width] = rect;
    const rowStart = Math.floor(row / cfg.tileHeight);
    const rowEnd = Math.max(rowStart + 1, Math.ceil((row + height) / cfg.tileHeight));
    const colStart = Math.floor(col / cfg.tileWidth);
    const colEnd = Math.max(colStart + 1, Math.ceil((col + width) / cfg.tileWidth));
    for (let r = rowStart; r < rowEnd && r < cfg.rowsTiles; r += 1) {
      for (let c = colStart; c < colEnd && c < cfg.colsTiles; c += 1) {
        const idx = r * cfg.colsTiles + c;
        cfg.mesh.setColorAt(idx, highlightColors[key]);
      }
    }
  });
  if (cfg.mesh.instanceColor) {
    cfg.mesh.instanceColor.needsUpdate = true;
  }
}

function highlightAll(key) {
  const cfg = matrices[key];
  if (!cfg) return;
  for (let idx = 0; idx < cfg.rowsTiles * cfg.colsTiles; idx += 1) {
    cfg.mesh.setColorAt(idx, highlightColors[key]);
  }
  if (cfg.mesh.instanceColor) {
    cfg.mesh.instanceColor.needsUpdate = true;
  }
}

function applyFrame(index) {
  if (!timeline.length) return;
  const frame = timeline[index];
  ['A', 'B', 'C'].forEach((key) => resetMatrixColors(key));

  if (frame.op === 'matmul' && frame.touch) {
    highlightRectangles('A', frame.touch.A);
    highlightRectangles('B', frame.touch.B);
    highlightRectangles('C', frame.touch.C);
  } else if (frame.op === 'act') {
    highlightAll('C');
  }

  const ijk = frame.ijk
    ? `i=${frame.ijk.i}, j=${frame.ijk.j}, k=${frame.ijk.k}`
    : '';
  const acc = frame.acc
    ? ` · step ${frame.acc.step}/${frame.acc.total_steps}`
    : '';
  const parts = [frame.layer, frame.op];
  if (ijk) {
    parts.push(ijk);
  }
  statusEl.textContent = `${parts.join(' · ')}${acc}`;

  stepIndicator.textContent = `Step ${index + 1} / ${timeline.length}`;
}

function advanceFrame(stepCount = 1) {
  if (!timeline.length) return;
  currentFrame = (currentFrame + stepCount) % timeline.length;
  applyFrame(currentFrame);
}

function animate() {
  requestAnimationFrame(animate);
  resizeRenderer();
  if (timeline.length && isPlaying) {
    const delta = clock.getDelta();
    const speed = parseFloat(speedSlider.value);
    accumulator += delta * speed;
    if (accumulator >= 1) {
      const steps = Math.floor(accumulator);
      accumulator -= steps;
      advanceFrame(steps);
    }
  } else {
    clock.getDelta();
  }
  renderer.render(scene, camera);
}

playPauseButton.addEventListener('click', () => {
  isPlaying = !isPlaying;
  playPauseButton.textContent = isPlaying ? '⏸ Pause' : '▶ Play';
  playPauseButton.classList.toggle('paused', !isPlaying);
});

speedSlider.addEventListener('input', () => {
  speedValue.textContent = `${Number(speedSlider.value).toFixed(2)}x`;
});

window.addEventListener('resize', resizeRenderer);

resizeRenderer();
animate();
loadTimeline();
