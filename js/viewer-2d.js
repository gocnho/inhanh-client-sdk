/**
 * INHANH API - 2D Dieline Viewer (Vanilla JS / ESM)
 * 
 * Hiển thị khuôn bế 2D (vector SVG) sắc nét với đầy đủ tính năng:
 * - Pan & Zoom mượt mà bằng chuột và cảm ứng (Pointer Events)
 * - Tự động căn giữa và vừa vặn khung hình (Fit View)
 * - Bật / tắt các lớp kỹ thuật: nét bế (cut), nét cấn (crease), bù hao (bleed), thước đo (dimensions)
 * - Xuất / Tải ảnh SVG trực tiếp
 */

export class Viewer2D {
  /**
   * @param {HTMLElement} container - Phần tử DOM chứa viewer
   */
  constructor(container) {
    this.container = container;
    this.svgElement = null;
    this.rawSvg = '';
    this.bounds = null;

    // Trạng thái Pan & Zoom
    this.zoom = 1.0;
    this.pan = { x: 0, y: 0 };
    this.isDragging = false;
    this.startPointer = { x: 0, y: 0 };
    this.startPan = { x: 0, y: 0 };

    // Trạng thái hiển thị các lớp
    this.layers = {
      cut: true,
      crease: true,
      bleed: true,
      dimensions: true,
    };

    this._initDom();
    this._bindEvents();
  }

  /**
   * Khởi tạo cấu trúc DOM cho viewport 2D
   * @private
   */
  _initDom() {
    this.container.innerHTML = '';
    this.container.classList.add('viewer-2d-host');
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.userSelect = 'none';
    this.container.style.touchAction = 'none';

    // Lớp wrapper chứa SVG để áp dụng translate & scale
    this.stage = document.createElement('div');
    this.stage.className = 'viewer-2d-stage';
    this.stage.style.position = 'absolute';
    this.stage.style.top = '0';
    this.stage.style.left = '0';
    this.stage.style.width = '0';
    this.stage.style.height = '0';
    this.stage.style.transformOrigin = '0 0';

    this.container.appendChild(this.stage);
  }

  /**
   * Gắn các sự kiện chuột và cảm ứng để Pan/Zoom
   * @private
   */
  _bindEvents() {
    // Kéo thả chuột / Pointer
    this.container.addEventListener('pointerdown', (e) => {
      // Chỉ kéo khi bấm chuột trái
      if (e.button !== 0) return;
      this.isDragging = true;
      this.startPointer = { x: e.clientX, y: e.clientY };
      this.startPan = { ...this.pan };
      this.container.setPointerCapture(e.pointerId);
      this.container.style.cursor = 'grabbing';
    });

    this.container.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.startPointer.x;
      const dy = e.clientY - this.startPointer.y;
      this.pan = {
        x: this.startPan.x + dx,
        y: this.startPan.y + dy,
      };
      this._applyTransform();
    });

    const endDrag = (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        try {
          this.container.releasePointerCapture(e.pointerId);
        } catch {}
        this.container.style.cursor = 'grab';
      }
    };

    this.container.addEventListener('pointerup', endDrag);
    this.container.addEventListener('pointercancel', endDrag);

    // Phóng to / Thu nhỏ bằng con lăn chuột (Zoom around cursor)
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.max(0.1, Math.min(15.0, this.zoom * zoomFactor));

      // Giữ tâm phóng to tại vị trí con trỏ chuột
      this.pan.x = cursorX - (cursorX - this.pan.x) * (newZoom / this.zoom);
      this.pan.y = cursorY - (cursorY - this.pan.y) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this._applyTransform();
    }, { passive: false });

    // Resize observer để cập nhật khi cửa sổ thay đổi
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.hasEverFitted && this.svgElement) {
        this.fitView();
      }
    });
    this.resizeObserver.observe(this.container);
  }

  /**
   * Nạp và hiển thị chuỗi SVG từ API
   * @param {string} rawSvg - Chuỗi SVG trả về từ server
   * @param {Object} [bounds] - { min_x, min_y, max_x, max_y }
   */
  render(rawSvg, bounds = null) {
    if (!rawSvg) return;
    this.rawSvg = rawSvg;
    this.bounds = bounds;

    // Phân tích chuỗi SVG
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
    const rootSvg = doc.querySelector('svg');

    if (!rootSvg) {
      console.error('Dữ liệu SVG không hợp lệ:', rawSvg);
      return;
    }

    // Đảm bảo SVG có viewBox thích hợp
    let vx = 0, vy = 0, vw = 800, vh = 600;
    const viewBoxAttr = rootSvg.getAttribute('viewBox');
    if (viewBoxAttr) {
      const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        vx = parts[0];
        vy = parts[1];
        vw = parts[2];
        vh = parts[3];
      }
    } else if (bounds) {
      vx = bounds.min_x || 0;
      vy = bounds.min_y || 0;
      vw = Math.max(10, bounds.max_x - bounds.min_x);
      vh = Math.max(10, bounds.max_y - bounds.min_y);
      rootSvg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    }

    this.viewBox = { vx, vy, vw, vh };

    // Cố định kích thước pixel của rootSvg đúng bằng kích thước viewBox (vw x vh)
    rootSvg.setAttribute('width', vw);
    rootSvg.setAttribute('height', vh);
    rootSvg.style.width = `${vw}px`;
    rootSvg.style.height = `${vh}px`;
    rootSvg.style.position = 'absolute';
    rootSvg.style.left = '0';
    rootSvg.style.top = '0';
    rootSvg.style.display = 'block';
    rootSvg.style.overflow = 'visible';
    rootSvg.style.pointerEvents = 'none';

    // Thêm style cho các layer
    let styleTag = rootSvg.querySelector('style');
    if (!styleTag) {
      styleTag = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
      rootSvg.prepend(styleTag);
    }
    
    // Thêm các class tiện ích nếu chưa có
    const customCss = `
      #container-2d .cut, #container-2d [stroke="#e11d48"], #container-2d [stroke="#ff0000"], #container-2d [class*="cut"] { stroke-dasharray: none !important; }
      #container-2d .crease, #container-2d [stroke="#2563eb"], #container-2d [stroke="#0000ff"], #container-2d [class*="crease"] { stroke-dasharray: 4 3 !important; }
      #container-2d .bleed, #container-2d [stroke="#10b981"], #container-2d [class*="bleed"] { stroke-dasharray: 2 2 !important; opacity: 0.6; }
      #container-2d .dimension, #container-2d .ruler, #container-2d [class*="dim"], #container-2d [class*="annotation"] { font-size: 10px; }
    `;
    styleTag.textContent += customCss;

    this.stage.innerHTML = '';
    this.stage.appendChild(rootSvg);
    this.svgElement = rootSvg;

    this._updateLayerVisibility();
    this.fitView();
    this.hasEverFitted = true;
  }

  /**
   * Áp dụng ma trận transform pan & zoom lên stage
   * @private
   */
  _applyTransform() {
    this.stage.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
  }

  /**
   * Căn giữa và bao trọn bản vẽ vào khung nhìn hiện tại (Fit to View)
   */
  fitView() {
    if (!this.svgElement || !this.viewBox) return;

    const containerRect = this.container.getBoundingClientRect();
    const cw = containerRect.width;
    const ch = containerRect.height;
    if (cw <= 0 || ch <= 0) return;

    const { vw, vh } = this.viewBox;

    // Chừa lề padding 40px
    const padding = 40;
    const availW = Math.max(20, cw - padding * 2);
    const availH = Math.max(20, ch - padding * 2);

    const scale = Math.min(availW / vw, availH / vh);
    this.zoom = scale;

    // Đưa tâm hình vào chính giữa khung container
    this.pan = {
      x: (cw - vw * scale) / 2,
      y: (ch - vh * scale) / 2,
    };

    this._applyTransform();
  }

  /**
   * Phóng to
   */
  zoomIn() {
    this.setZoom(this.zoom * 1.25);
  }

  /**
   * Thu nhỏ
   */
  zoomOut() {
    this.setZoom(this.zoom * 0.8);
  }

  /**
   * Đặt mức zoom cụ thể và giữ tâm
   */
  setZoom(newZoom) {
    const rect = this.container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const clampedZoom = Math.max(0.1, Math.min(15.0, newZoom));
    this.pan.x = cx - (cx - this.pan.x) * (clampedZoom / this.zoom);
    this.pan.y = cy - (cy - this.pan.y) * (clampedZoom / this.zoom);
    this.zoom = clampedZoom;

    this._applyTransform();
  }

  /**
   * Bật / tắt hiển thị từng lớp
   * @param {'cut' | 'crease' | 'bleed' | 'dimensions'} layerName
   * @param {boolean} visible
   */
  toggleLayer(layerName, visible) {
    if (this.layers[layerName] === undefined) return;
    this.layers[layerName] = Boolean(visible);
    this._updateLayerVisibility();
  }

  /**
   * Cập nhật style CSS để ẩn/hiện các lớp
   * @private
   */
  _updateLayerVisibility() {
    if (!this.svgElement) return;

    const setVisibility = (selector, visible) => {
      const elements = this.svgElement.querySelectorAll(selector);
      elements.forEach((el) => {
        el.style.display = visible ? '' : 'none';
      });
    };

    setVisibility('.cut, [stroke="#e11d48"], [stroke="#ff0000"], [id*="cut"], [class*="cut"]', this.layers.cut);
    setVisibility('.crease, [stroke="#2563eb"], [stroke="#0000ff"], [id*="crease"], [class*="crease"]', this.layers.crease);
    setVisibility('.bleed, [stroke="#10b981"], [id*="bleed"], [class*="bleed"]', this.layers.bleed);
    setVisibility('#layer-dimensions, .dimension, .ruler, [id*="dimension"], [class*="dimension"], [id*="callout"], text', this.layers.dimensions);
  }

  /**
   * Tải về file SVG cục bộ
   * @param {string} [filename='dieline-2d.svg']
   */
  downloadSvg(filename = 'dieline-2d.svg') {
    if (!this.rawSvg) return;
    const blob = new Blob([this.rawSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Dọn dẹp tài nguyên
   */
  dispose() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.container.innerHTML = '';
  }
}
