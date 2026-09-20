/**
 * INHANH API - 3D Packaging Kinematics Viewer (Three.js / ESM)
 * 
 * Tái hiện mô hình 3D đóng mở hộp bao bì theo động học chuẩn (Kinematics Fold Tree):
 * - Extrude panels theo độ dày thực tế của giấy
 * - Nối cây bản lề (hinge hierarchy) với chuyển động quay 3D mượt mà (smoothstep)
 * - Tương tác xoay 360° tự do (OrbitControls)
 * - Hỗ trợ thanh trượt gập mở 0% - 100%, đổi màu giấy, lưới wireframe, chụp ảnh màn hình
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Hệ số chuyển đổi mm sang toạ độ Three.js scene (1mm = 0.001 Three unit)
const MM = 0.001;

// Hàm nội suy mượt mà Smoothstep (Hermite easing)
const smooth = (t) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

export class Viewer3D {
  /**
   * @param {HTMLElement} container - Phần tử DOM chứa canvas 3D
   * @param {Object} [options]
   * @param {string} [options.paperHex='#f4ede4'] - Màu giấy mặc định (kraft/cardboard)
   * @param {boolean} [options.autoRotate=false] - Tự động xoay
   */
  constructor(container, options = {}) {
    this.container = container;
    this.paperHex = options.paperHex || '#f4ede4';
    this.isAutoRotate = Boolean(options.autoRotate);
    this.isWireframe = false;
    this.showLines = true;
    this.foldProgress = 1.0; // Mặc định hiển thị ở trạng thái đã gập hoàn chỉnh

    this.tree = null;
    this.index = { groups: new Map(), byId: new Map() };
    this.lineGroups = [];

    this._initThree();
    this._initLighting();
    this._bindEvents();
    this._startLoop();
  }

  /**
   * Khởi tạo WebGL Renderer, Scene, Camera và OrbitControls
   * @private
   */
  _initThree() {
    this.container.innerHTML = '';
    this.container.classList.add('viewer-3d-host');
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.width = '100%';
    this.container.style.height = '100%';

    // Three.js Scene
    this.scene = new THREE.Scene();

    // Camera
    const rect = this.container.getBoundingClientRect();
    const aspect = (rect.width || 800) / (rect.height || 600);
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.001, 30);
    this.camera.position.set(0.4, 0.35, 0.5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(rect.width || 800, rect.height || 600);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = this.isAutoRotate;
    this.controls.autoRotateSpeed = 1.8;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = 10.0;

    // Gốc đối tượng mô hình bao bì
    this.modelRoot = new THREE.Group();
    this.modelRoot.name = 'PackagingModelRoot';
    this.scene.add(this.modelRoot);

    this.foldRoot = new THREE.Group();
    this.foldRoot.name = 'PackagingFoldRoot';
    this.modelRoot.add(this.foldRoot);

    // Vật liệu
    this.materials = this._createMaterials(this.paperHex, this.isWireframe);
  }

  /**
   * Thiết lập hệ thống chiếu sáng chuẩn Studio (Studio Lighting)
   * @private
   */
  _initLighting() {
    // Ánh sáng môi trường vòm trời
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.2);
    this.scene.add(hemiLight);

    // Đèn chính (Key Light) tạo khối sắc nét
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(0.8, 1.4, 0.9);
    this.scene.add(keyLight);

    // Đèn phụ (Fill Light) làm mềm các góc tối
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(-0.7, 0.5, -0.6);
    this.scene.add(fillLight);

    // Bóng đổ tiếp xúc mặt sàn (Contact shadow plane)
    const shadowGeo = new THREE.PlaneGeometry(1.5, 1.5);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.22)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const shadowTex = new THREE.CanvasTexture(canvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = -0.001;
    this.scene.add(this.shadowMesh);
  }

  /**
   * Tạo bộ vật liệu giấy và nét gấp
   * @private
   */
  _createMaterials(paperHex, wireframe = false) {
    const substrate = new THREE.MeshStandardMaterial({
      color: paperHex,
      roughness: 0.72,
      metalness: 0.05,
      wireframe: wireframe,
      side: THREE.DoubleSide,
    });

    const crease = new THREE.LineDashedMaterial({
      color: 0x2563eb,
      dashSize: 0.003,
      gapSize: 0.002,
      depthTest: true,
    });

    const cut = new THREE.LineBasicMaterial({
      color: 0xe11d48,
      depthTest: true,
    });

    return { substrate, crease, cut };
  }

  /**
   * Nạp cây động học SceneTree từ API compile và dựng hình 3D
   * @param {Object} tree - Cấu trúc scene.tree từ compile response
   */
  render(tree) {
    if (!tree || !tree.panels || !tree.panels.length) return;
    this.tree = tree;

    // Dọn dẹp mô hình cũ
    while (this.foldRoot.children.length > 0) {
      const obj = this.foldRoot.children[0];
      this.foldRoot.remove(obj);
    }
    this.index.groups.clear();
    this.index.byId.clear();
    this.lineGroups = [];

    // Định vị toạ độ gốc (Root frame)
    if (tree.rootPosition) {
      this.foldRoot.position.set(
        tree.rootPosition[0] * MM,
        tree.rootPosition[1] * MM,
        tree.rootPosition[2] * MM
      );
    }
    if (tree.rootRotationX !== undefined) {
      this.foldRoot.rotation.x = tree.rootRotationX;
    }

    // Dựng các mặt phẳng panels
    this._buildPanels();

    // Nối liên kết bản lề hinges
    if (tree.hinges && tree.hinges.length) {
      this._wireHinges();
    }

    // Áp dụng góc gập theo giá trị foldProgress hiện tại
    this.applyFold(this.foldProgress);

    // Căn giữa mô hình và đặt camera
    this._frameCamera();
  }

  /**
   * Dựng các panel từ toạ độ 2D contour và holes
   * @private
   */
  _buildPanels() {
    const tree = this.tree;
    const thicknessMm = Math.max(tree.thicknessMm || 0.4, 0.15);
    const extrudeDepth = thicknessMm * MM;
    const lineZ = 0.0005 * MM;
    const attached = new Set(tree.attachedChildren || []);

    // Thu thập danh sách các đường cấn để không vẽ cạnh thừa ở viền gấp
    const allCreases = [];
    for (const p of tree.panels) {
      this.index.byId.set(p.id, p);
      for (const seg of p.creaseLines || []) {
        if (seg.length >= 2) {
          const p1 = [seg[0][0] + p.pivot[0], -(seg[0][1] - (-p.pivot[1]))];
          const p2 = [seg[1][0] + p.pivot[0], -(seg[1][1] - (-p.pivot[1]))];
          allCreases.push([p1, p2]);
        }
      }
    }

    const isCrease = (pA, pB, pivot) => {
      const gA = [pA[0] + pivot[0], -(pA[1] - (-pivot[1]))];
      const gB = [pB[0] + pivot[0], -(pB[1] - (-pivot[1]))];
      const mx = (gA[0] + gB[0]) / 2;
      const my = (gA[1] + gB[1]) / 2;

      return allCreases.some(([c1, c2]) => {
        const cross = Math.abs((my - c1[1]) * (c2[0] - c1[0]) - (mx - c1[0]) * (c2[1] - c1[1]));
        const len = Math.hypot(c2[0] - c1[0], c2[1] - c1[1]);
        if (len < 1e-6) return false;
        if (cross / len > 0.5) return false;
        const dot = (mx - c1[0]) * (c2[0] - c1[0]) + (my - c1[1]) * (c2[1] - c1[1]);
        return dot >= -0.5 && dot <= len * len + 0.5;
      });
    };

    for (const p of tree.panels) {
      const group = new THREE.Group();
      group.name = `panel_${p.id}`;
      group.position.set(p.pivot[0] * MM, p.pivot[1] * MM, p.pivot[2] * MM);

      // Tạo đường viền Shape 2D
      const shape = new THREE.Shape();
      (p.points || []).forEach(([x, y], i) => {
        if (i === 0) shape.moveTo(x * MM, y * MM);
        else shape.lineTo(x * MM, y * MM);
      });
      shape.closePath();

      // Thêm các lỗ khoét (holes)
      for (const loop of p.holes || []) {
        const holePath = new THREE.Path();
        loop.forEach(([x, y], i) => {
          if (i === 0) holePath.moveTo(x * MM, y * MM);
          else holePath.lineTo(x * MM, y * MM);
        });
        holePath.closePath();
        shape.holes.push(holePath);
      }

      // Đùn khối hộp (Extrude)
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: extrudeDepth,
        bevelEnabled: false,
        steps: 1,
      });
      geo.translate(0, 0, -extrudeDepth);

      // Cắt bớt các mặt cạnh bên trên đường gấp để các cạnh chạm khít hoàn hảo
      const capCount = geo.groups[0]?.count || 0;
      const posAttr = geo.attributes.position;
      const normAttr = geo.attributes.normal;
      const uvAttr = geo.attributes.uv;
      const nSegs = p.points.length;

      const keep = [];
      for (let i = 0; i < capCount; i++) keep.push(i);

      for (let s = 0; s < nSegs; s++) {
        const pA = p.points[s];
        const pB = p.points[(s + 1) % nSegs];
        if (!isCrease(pA, pB, p.pivot)) {
          const start = capCount + s * 6;
          for (let v = 0; v < 6; v++) keep.push(start + v);
        }
      }
      for (let i = capCount + nSegs * 6; i < posAttr.count; i++) keep.push(i);

      if (keep.length < posAttr.count) {
        const newPos = new Float32Array(keep.length * 3);
        const newNorm = normAttr ? new Float32Array(keep.length * 3) : null;
        const newUv = uvAttr ? new Float32Array(keep.length * 2) : null;
        for (let i = 0; i < keep.length; i++) {
          const src = keep[i];
          newPos[i * 3] = posAttr.getX(src);
          newPos[i * 3 + 1] = posAttr.getY(src);
          newPos[i * 3 + 2] = posAttr.getZ(src);
          if (newNorm && normAttr) {
            newNorm[i * 3] = normAttr.getX(src);
            newNorm[i * 3 + 1] = normAttr.getY(src);
            newNorm[i * 3 + 2] = normAttr.getZ(src);
          }
          if (newUv && uvAttr) {
            newUv[i * 2] = uvAttr.getX(src);
            newUv[i * 2 + 1] = uvAttr.getY(src);
          }
        }
        geo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
        if (newNorm) geo.setAttribute('normal', new THREE.BufferAttribute(newNorm, 3));
        if (newUv) geo.setAttribute('uv', new THREE.BufferAttribute(newUv, 2));
      }

      const mesh = new THREE.Mesh(geo, this.materials.substrate);
      group.add(mesh);

      // Thêm các đường vẽ kỹ thuật (crease/cut lines) nổi nhẹ phía trên mặt giấy
      const linesGroup = new THREE.Group();
      linesGroup.name = `lines_${p.id}`;

      const addPoly = (polys, mat) => {
        for (const seg of polys || []) {
          if (!seg || seg.length < 2) continue;
          const pts = seg.map(([x, y]) => new THREE.Vector3(x * MM, y * MM, lineZ));
          const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
          linesGroup.add(new THREE.Line(lineGeo, mat));
        }
      };

      addPoly(p.creaseLines, this.materials.crease);
      addPoly(p.cutLines, this.materials.cut);
      linesGroup.visible = this.showLines;
      this.lineGroups.push(linesGroup);
      group.add(linesGroup);

      this.index.groups.set(p.id, group);
      if (!attached.has(p.id)) {
        this.foldRoot.add(group);
      }
    }
  }

  /**
   * Nối liên kết cây bản lề giữa mặt cha và mặt con
   * @private
   */
  _wireHinges() {
    for (const h of this.tree.hinges || []) {
      const child = this.index.groups.get(h.childId);
      const parent = this.index.groups.get(h.parentId);
      if (!child || !parent) continue;

      const childPivot = this.index.byId.get(h.childId)?.pivot || [0, 0, 0];
      const parentPivot = this.index.byId.get(h.parentId)?.pivot || [0, 0, 0];

      const hl = new THREE.Vector3(h.hingeLocal[0] * MM, h.hingeLocal[1] * MM, 0);

      // Định vị tương đối của mặt con so với bản lề
      child.position.set(
        (childPivot[0] - parentPivot[0] - h.hingeLocal[0]) * MM,
        (childPivot[1] - parentPivot[1] - h.hingeLocal[1]) * MM,
        0
      );

      // Tạo pivot xoay bản lề
      const pivotGrp = new THREE.Group();
      pivotGrp.name = `hinge_${h.parentId}_to_${h.childId}`;
      pivotGrp.position.copy(hl);

      pivotGrp.add(child);
      parent.add(pivotGrp);
    }
  }

  /**
   * Áp dụng tiến độ gập mở hộp (0 = phẳng, 1 = gập kín)
   * @param {number} rawProgress - Giá trị từ 0.0 đến 1.0
   */
  applyFold(rawProgress) {
    this.foldProgress = Math.max(0, Math.min(1, rawProgress));
    if (!this.tree || !this.tree.hinges) return;

    const maxPhaseEnd = this.tree.maxPhaseEnd || 1.0;
    const p = this.foldProgress * maxPhaseEnd;

    for (const h of this.tree.hinges) {
      const pivotObj = this.index.groups.get(h.parentId)?.getObjectByName(`hinge_${h.parentId}_to_${h.childId}`);
      if (!pivotObj) continue;

      const [s, e] = h.phase || [0, 1];
      const tv = e > s ? smooth((p - s) / (e - s)) : (p >= s ? 1 : 0);

      // Dịch chuyển Z nếu có bù trừ độ dày lồng nhau
      pivotObj.position.z = (h.hingeLocal[2] || 0) * MM * tv;

      // Xoay quanh trục bản lề
      const axis = new THREE.Vector3(h.axis[0], h.axis[1], h.axis[2]).normalize();
      pivotObj.setRotationFromAxisAngle(axis, h.signedRadians * tv);
    }

    // Đặt lại mặt đáy hộp chạm sàn bóng đổ
    this._seatModel();
  }

  /**
   * Đặt đáy mô hình chạm khít sàn và co giãn kích thước bóng đổ
   * @private
   */
  _seatModel() {
    this.modelRoot.position.set(0, 0, 0);
    this.modelRoot.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(this.foldRoot);
    if (!box.isEmpty()) {
      // Nâng mô hình để đáy chạm y = 0
      this.modelRoot.position.y = -box.min.y;

      // Căn giữa theo trục X và Z
      const center = new THREE.Vector3();
      box.getCenter(center);
      this.modelRoot.position.x = -center.x;
      this.modelRoot.position.z = -center.z;

      // Điều chỉnh kích thước bóng đổ tiếp xúc
      const size = new THREE.Vector3();
      box.getSize(size);
      const radius = Math.max(size.x, size.z) * 1.35;
      if (this.shadowMesh) {
        this.shadowMesh.scale.set(radius, radius, 1);
      }
    }
  }

  /**
   * Căn chỉnh góc nhìn và khoảng cách camera bao trọn mô hình
   * @private
   */
  _frameCamera() {
    this._seatModel();
    const box = new THREE.Box3().setFromObject(this.modelRoot);
    if (box.isEmpty()) return;

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.1);

    const fov = this.camera.fov * (Math.PI / 180);
    let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.75;
    cameraDistance = Math.max(cameraDistance, 0.2);

    const center = new THREE.Vector3(0, size.y * 0.45, 0);
    this.camera.position.set(cameraDistance * 0.85, cameraDistance * 0.75, cameraDistance * 1.1);
    this.camera.lookAt(center);
    this.controls.target.copy(center);
    this.controls.update();

    this.defaultCamPos = this.camera.position.clone();
    this.defaultTarget = center.clone();
  }

  /**
   * Đặt lại góc camera về mặc định
   */
  resetCamera() {
    if (this.defaultCamPos && this.defaultTarget) {
      this.camera.position.copy(this.defaultCamPos);
      this.controls.target.copy(this.defaultTarget);
      this.controls.update();
    }
  }

  /**
   * Đổi màu giấy
   * @param {string} hexColor - Ví dụ: '#ffffff', '#e2d4c0', '#2d3748'
   */
  setPaperColor(hexColor) {
    this.paperHex = hexColor;
    if (this.materials.substrate) {
      this.materials.substrate.color.set(hexColor);
    }
  }

  /**
   * Bật/tắt chế độ lưới khung dây (Wireframe)
   */
  toggleWireframe() {
    this.isWireframe = !this.isWireframe;
    if (this.materials.substrate) {
      this.materials.substrate.wireframe = this.isWireframe;
    }
    return this.isWireframe;
  }

  /**
   * Bật/tắt tự động xoay (Auto Rotate)
   */
  toggleAutoRotate() {
    this.isAutoRotate = !this.isAutoRotate;
    this.controls.autoRotate = this.isAutoRotate;
    return this.isAutoRotate;
  }

  /**
   * Bật/tắt hiển thị đường cấn và bế trên mặt 3D
   */
  toggleLines(visible) {
    this.showLines = Boolean(visible);
    this.lineGroups.forEach(grp => {
      grp.visible = this.showLines;
    });
  }

  /**
   * Chụp ảnh render mô hình 3D và tải về file PNG
   * @param {string} [filename='3d-packaging.png']
   */
  screenshot(filename = '3d-packaging.png') {
    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Vòng lặp render liên tục
   * @private
   */
  _startLoop() {
    const animate = () => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  /**
   * Gắn sự kiện thay đổi kích thước khung hình
   * @private
   */
  _bindEvents() {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.disposed) return;
      const rect = this.container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(rect.width, rect.height);
      }
    });
    this.resizeObserver.observe(this.container);
  }

  /**
   * Giải phóng bộ nhớ và tài nguyên WebGL
   */
  dispose() {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.resizeObserver) this.resizeObserver.disconnect();

    this.renderer.dispose();
    this.controls.dispose();
    this.container.innerHTML = '';
  }
}
