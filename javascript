// Essential Imports via CDN
import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js'; // Three.js core [cite: 1]
import { GLTFLoader } from 'https://unpkg.com/three@0.180.0/examples/jsm/loaders/GLTFLoader.js'; // GLB/GLTF loading [cite: 2]
import { OrbitControls } from 'https://unpkg.com/three@0.180.0/examples/jsm/controls/OrbitControls.js'; // Camera controls [cite: 2]
import * as Kalidokit from 'https://cdn.jsdelivr.net/npm/kalidokit@1.1.1/dist/kalidokit.module.js'; // Rigging solution [cite: 2]
import { Holistic } from 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.4.1633559476/holistic.js'; // Face tracking [cite: 3]
import { Camera } from 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.4.1633559476/camera_utils.js'; // Camera utils [cite: 3]
import { createWLipSyncNode } from 'https://cdn.jsdelivr.net/npm/wlipsync/dist/wlipsync-single.js'; // Lip sync module [cite: 4]

// Core State Variables [cite: 5]
let scene, camera, renderer, controls;
let avatar;
let mixer;
const clock = new THREE.Clock();

// Morph Target Mapping [cite: 5, 6]
let morphTargetsMap = {}; // { morphName: { mesh, index } }

// Audio and UI Elements [cite: 6, 7]
let lipsyncNode, audioContext, audioSource;

const stepText = document.getElementById('stepText');
const nextStepBtn = document.getElementById('nextStepBtn');
const morphMouth = document.getElementById('morph-mouth');
const colorSkin = document.getElementById('color-skin');
const locationText = document.getElementById('locationText');
const speechText = document.getElementById('speechText');

// Application Step Management [cite: 8, 9, 10, 11]
const steps = [
  "Load Avatar",
  "Start Face Tracking",
  "Start Lip Sync",
  "Customize Character",
  "Show Location",
  "Done"
];
let currentStep = 0;

nextStepBtn.onclick = () => {
  currentStep++;
  if (currentStep >= steps.length) currentStep = steps.length - 1;
  updateOverlay();
};

function updateOverlay() {
  stepText.innerText = `Step ${currentStep + 1}: ${steps[currentStep]}`;
  if (currentStep === steps.length - 1) {
    nextStepBtn.style.display = 'none';
  }
}

// --- INITIALIZATION ---

async function init() {
  updateOverlay();

  // 1. Scene / Camera / Renderer Setup [cite: 12, 13, 14]
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 2.5);
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas3d'), antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.update();

  // 2. Lighting [cite: 14, 15]
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  hemi.position.set(0, 1, 0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(2, 4, 2);
  scene.add(dir);

  // 3. Core Features Execution (following steps array) [cite: 16, 17]
  await loadAvatar();
  await startFaceTracking();
  await initLipSync();
  setupUI();
  startGeo(); // Geolocation is non-blocking, but placed here for flow

  // 4. Final Setup [cite: 17]
  window.addEventListener('resize', onWindowResize);
  animate();
}

// --- FEATURE FUNCTIONS ---

async function loadAvatar() {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('assets/avatar.glb');
  avatar = gltf.scene;
  scene.add(avatar); // [cite: 18]

  // Setup Animation Mixer [cite: 19, 20]
  if (gltf.animations && gltf.animations.length) {
    mixer = new THREE.AnimationMixer(avatar);
    gltf.animations.forEach(clip => {
      mixer.clipAction(clip).play();
    });
  }

  // Build Morph Map for face tracking/lip sync [cite: 21]
  avatar.traverse(obj => {
    if (obj.isMesh && obj.morphTargetDictionary) {
      for (const [name, idx] of Object.entries(obj.morphTargetDictionary)) {
        morphTargetsMap[name] = { mesh: obj, index: idx };
      }
    }
  });
  updateOverlay();
}

async function startFaceTracking() {
  const video = document.createElement('video');
  video.style.display = 'none';
  document.body.append(video); // [cite: 22]

  const holistic = new Holistic({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.4.1633559476/${file}`;
    }
  }); // [cite: 23]
  
  holistic.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    refineFaceLandmarks: true,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7,
  }); // [cite: 24]
  holistic.onResults(onHolisticResults); // [cite: 25]

  const cameraFeed = new Camera(video, {
    onFrame: async () => {
      await holistic.send({ image: video });
    },
    width: 640,
    height: 480,
  });
  cameraFeed.start(); // [cite: 26]
  updateOverlay();
}

function onHolisticResults(results) {
  if (!avatar) return;

  if (results.faceLandmarks) {
    const rig = Kalidokit.Face.solve(results.faceLandmarks, {
      runtime: 'mediapipe',
      video: null,
    }); // [cite: 27]

    // Apply mouth open from face tracking (can interfere with lip sync)
    if (rig.mouth && morphTargetsMap['mouth_Open']) {
      const { mesh, index } = morphTargetsMap['mouth_Open'];
      mesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(rig.mouth.open, 0, 1); // [cite: 28]
    }
  }
}

function startGeo() {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(pos => {
      const coords = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      locationText.innerText = coords; // [cite: 29]
    }, err => {
      console.warn("Could not get location:", err);
      locationText.innerText = "Location Blocked/Unavailable";
    });
  } else {
    locationText.innerText = "Geolocation Not Supported";
  }
  updateOverlay();
}

async function initLipSync() {
  audioContext = new AudioContext();
  const profile = await fetch('assets/lipsync_profile.json').then(r => r.json()); // [cite: 29]
  lipsyncNode = await createWLipSyncNode(audioContext, profile); // [cite: 30]

  const audioEl = new Audio();
  // NOTE: You must uncomment and set a valid audio source here for lip sync to work
  // audioEl.src = 'your_audio_url_or_blob'; // [cite: 31]
  audioEl.crossOrigin = 'anonymous'; // [cite: 32]
  await audioEl.load();

  audioSource = audioContext.createMediaElementSource(audioEl);
  audioSource.connect(lipsyncNode).connect(audioContext.destination);

  lipsyncNode.port.onmessage = (event) => {
    const { weights } = event.data;
    applyViseme(weights); // [cite: 33]
  };
  updateOverlay();
}

function applyViseme(weights) {
  // Map viseme weights to morphs (e.g., viseme 0 → 'mouth_Open')
  if (weights[0] !== undefined && morphTargetsMap['mouth_Open']) {
    const { mesh, index } = morphTargetsMap['mouth_Open'];
    mesh.morphTargetInfluences[index] = weights[0]; // [cite: 34]
  }
  // Extend to more viseme → morph mapping here
}

function setupUI() {
  morphMouth.oninput = (ev) => {
    const v = parseFloat(ev.target.value);
    if (morphTargetsMap['mouth_Open']) {
      morphTargetsMap['mouth_Open'].mesh.morphTargetInfluences[morphTargetsMap['mouth_Open'].index] = v; // [cite: 35]
    }
  }; // [cite: 36]
  colorSkin.oninput = (ev) => {
    const col = new THREE.Color(ev.target.value);
    avatar.traverse(obj => {
      if (obj.isMesh && obj.material && obj.material.color) {
        obj.material.color.set(col); // [cite: 37]
      }
    }); // [cite: 38]
  };
  updateOverlay();
}

// --- ANIMATION AND RESIZE ---

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta); // [cite: 39]
  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); // [cite: 40]
}

// Start the application
init().catch(err => {
  console.error("Error initializing 3D Avatar Web Starter:", err);
});