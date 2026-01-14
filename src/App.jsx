import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import gsap from 'gsap';
import GUI from 'lil-gui';
import './App.css';

function App() {
  const canvasRef = useRef(null);
  const weaponRef = useRef(null);
  const backgroundMaterialRef = useRef(null);
  const composerRef = useRef(null);

  useEffect(() => {
    // --- 1. GUI & 設定 ---
    const gui = new GUI({ title: 'VALO-STORE プロフェッショナル' });
    const settings = {
      scale: 0.5,
      metalness: 0.9,
      roughness: 0.1,
      bgSpeed: 0.5,
      bgColor1: '#06090f',
      bgColor2: '#4c1d95',
      lineSpeed: 1.5,
      lineColor: '#2425ac',
      bloomStrength: 1.0,
      bloomRadius: 0.5,
      bloomThreshold: 0.9,
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 5);
    scene.add(camera); // 背景をカメラに貼るために必須

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.0;

    // --- 2. OrbitControls ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 7;

    // --- 3. 背景シェーダー ---
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const fragmentShader = `
      uniform float uTime;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uLineColor;
      uniform float uLineSpeed;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        float wave = sin(uv.x * 4.0 + uTime * 1.2) * cos(uv.y * 3.0 + uTime * 0.8);
        wave += sin(uv.y * 6.0 - uTime * 1.5) * 0.3;
        float intensity = wave * 0.5 + 0.5;
        vec3 baseColor = mix(uColor1, uColor2, intensity);
        float linePos = uv.y - uv.x * 0.5; 
        float lines = fract(linePos * 20.0 + uTime * uLineSpeed);
        lines = smoothstep(0.85, 0.95, lines);
        vec3 finalColor = baseColor + uLineColor * lines * 1.5; 
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    // 【修正】板を圧倒的に巨大にする (200x200)
    const bgGeometry = new THREE.PlaneGeometry(200, 200);
    const bgMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(settings.bgColor1) },
        uColor2: { value: new THREE.Color(settings.bgColor2) },
        uLineColor: { value: new THREE.Color(settings.lineColor) },
        uLineSpeed: { value: settings.lineSpeed },
      },
      depthWrite: false, // 武器の後ろに描画されることを保証
    });
    backgroundMaterialRef.current = bgMaterial;

    const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
    
    // 【修正】カメラの少し後ろ（z=-50）に配置
    // 巨大な板を遠くに置くことで、カメラを回しても端が見えなくなります
    bgMesh.position.set(0, 0, -50);
    camera.add(bgMesh);

    // --- 4. ポストプロセッシング ---
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      settings.bloomStrength,
      settings.bloomRadius,
      settings.bloomThreshold
    );
    composerRef.current = new EffectComposer(renderer);
    composerRef.current.addPass(renderScene);
    composerRef.current.addPass(bloomPass);

    // --- 5. ライティング ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    // --- 6. モデル読み込み ---
    const loader = new GLTFLoader();
    loader.load('/models/phantom.glb', (gltf) => {
      const weapon = gltf.scene;
      weapon.scale.set(settings.scale, settings.scale, settings.scale);
      weapon.rotation.y = Math.PI * -0.5;
      weapon.traverse(child => {
        if (child.isMesh) {
          child.material.metalness = settings.metalness;
          child.material.roughness = settings.roughness;
        }
      });
      scene.add(weapon);
      weaponRef.current = weapon;

      const bgFolder = gui.addFolder('背景エフェクト');
      bgFolder.add(settings, 'bgSpeed', 0, 2).name('モヤの速さ');
      bgFolder.addColor(settings, 'bgColor1').name('モヤ色1');
      bgFolder.addColor(settings, 'bgColor2').name('モヤ色2');
    });

    // --- 7. アニメーション ---
    const clock = new THREE.Clock();
    const tick = () => {
      const elapsedTime = clock.getElapsedTime();
      controls.update();

      if (backgroundMaterialRef.current) {
        backgroundMaterialRef.current.uniforms.uTime.value = elapsedTime * settings.bgSpeed;
      }
      if (weaponRef.current) {
        weaponRef.current.position.y = Math.sin(elapsedTime * 0.4) * 0.05;
      }

      if (composerRef.current) composerRef.current.render();
      window.requestAnimationFrame(tick);
    };
    tick();

    // --- 8. リサイズ対応 ---
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
      if (composerRef.current) {
        composerRef.current.setSize(width, height);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      gui.destroy();
      renderer.dispose(); 
    };
  }, []);

  return (
    <div className="valo-container">
      <canvas ref={canvasRef} className="webgl" />
      <div className="ui-overlay">
        <header className="header"><div className="back-btn">← 戻る // ストア</div></header>
        <main className="weapon-content">
          <div className="weapon-info">
            <span className="skin-tag">スキン</span>
            <h1 className="weapon-name">アヤカシ ファントム</h1>
          </div>
          <div className="action-buttons">
            <div className="price-card"><span className="vp-icon">V</span><span className="price">2,375</span></div>
            <button className="buy-button">アイテム購入</button>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;