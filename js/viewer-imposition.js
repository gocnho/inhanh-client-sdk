/**
 * INHANH API - Imposition Press-Sheet Viewer (Vanilla JS / ESM)
 * 
 * Trực quan hóa sơ đồ bình trang (N-up imposition) trên khổ in công nghiệp:
 * - Vẽ kích thước tờ in chuẩn mm (1 đơn vị SVG = 1 mm)
 * - Đánh dấu dải kẹp nhíp (Gripper strip) trên cạnh dài tờ in
 * - Hiển thị lề an toàn (margins) và vùng in khả dụng (usable area)
 * - Định vị từng con tem/hộp (placements) kèm góc xoay 0° hoặc 90°
 * - Lồng trực tiếp dieline vector vào từng phôi để xem trực quan khe hở (gutter)
 * - Tương tác Pan/Zoom mượt mà và chuyển đổi các lớp hiển thị
 */

export class ViewerImposition {
  /**
   * @param {HTMLElement} container - Phần tử DOM chứa viewer
   */
  constructor(container) {
    this.container = container;
    this.activePlan = null;
    this.dielineSvg = '';
    this.dieBounds = null;

    // Trạng thái Pan & Zoom
    this.zoom = 1.0;
    this.pan = { x: 0, y: 0 };
    this.isDragging = false;
    this.startPointer = { x: 0, y: 0 };
    this.startPan = { x: 0, y: 0 };

    // Trạng thái lớp hiển thị
    this.layers = {
      sheet: true,
      gripper: true,
      margins: true,
      cells: true,
      dielines: true,
      labels: true,
    };

    this._initDom();
    this._bindEvents();
  }

  /**
   * Khởi tạo DOM container
   * @private
   */
  _initDom() {
    this.container.innerHTML = '';
    this.container.classList.add('viewer-imposition-host');
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.userSelect = 'none';
    this.container.style.touchAction = 'none';

    this.stage = document.createElement('div');
    this.stage.className = 'viewer-imposition-stage';
    this.stage.style.position = 'absolute';
    this.stage.style.top = '0';
    this.stage.style.left = '0';
    this.stage.style.width = '0';
    this.stage.style.height = '0';
    this.stage.style.transformOrigin = '0 0';

    this.container.appendChild(this.stage);
  }

  /**
   * Gắn sự kiện Pan & Zoom
   * @private
   */
  _bindEvents() {
    this.container.addEventListener('pointerdown', (e) => {
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

    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.max(0.05, Math.min(10.0, this.zoom * factor));

      this.pan.x = cursorX - (cursorX - this.pan.x) * (newZoom / this.zoom);
      this.pan.y = cursorY - (cursorY - this.pan.y) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this._applyTransform();
    }, { passive: false });

    this.resizeObserver = new ResizeObserver(() => {
      if (this.activePlan && !this.hasFitted) {
        this.fitView();
      }
    });
    this.resizeObserver.observe(this.container);
  }

  /**
   * Render sơ đồ bình trang từ kết quả API imposition
   * @param {Object} plan - Một phương án từ danh sách plans trả về của /v1/engine/imposition
   * @param {string} [dielineSvg=''] - Chuỗi SVG của con hộp để lồng vào từng phôi
   * @param {Object} [dieBounds=null] - Bounding box của khuôn bế
   */
  render(plan, dielineSvg = '', dieBounds = null) {
    if (!plan) return;
    this.activePlan = plan;
    this.dielineSvg = dielineSvg;
    this.dieBounds = dieBounds;

    const sheet = plan.sheet || {};
    const sheetW = sheet.sheet_width_mm || 650;
    const sheetH = sheet.sheet_height_mm || 860;
    const grip = sheet.gripper_margin_mm ?? 10;
    const gutterX = sheet.gutter_x_mm ?? (plan.gutter_x_mm ?? 5);
    const gutterY = sheet.gutter_y_mm ?? (plan.gutter_y_mm ?? 5);
    const gripperEdge = plan.gripper_edge || (sheetH >= sheetW ? 'left' : 'bottom');

    let mTop = sheet.margin_top_mm ?? 10;
    let mRight = sheet.margin_right_mm ?? 10;
    let mBottom = sheet.margin_bottom_mm ?? 10;
    let mLeft = sheet.margin_left_mm ?? 10;

    if (gripperEdge === 'left') mLeft = Math.max(mLeft, grip);
    else if (gripperEdge === 'bottom') mBottom = Math.max(mBottom, grip);
    else if (gripperEdge === 'top') mTop = Math.max(mTop, grip);
    else if (gripperEdge === 'right') mRight = Math.max(mRight, grip);

    const usableW = Math.max(10, sheetW - mLeft - mRight);
    const usableH = Math.max(10, sheetH - mTop - mBottom);

    this.sheetSize = { sw: sheetW, sh: sheetH };

    // Kích thước khuôn bế thực tế từ dieBounds hoặc plan.die
    const dieW = (dieBounds ? Math.round(dieBounds.max_x - dieBounds.min_x) : null) || plan.die?.width_mm || 300;
    const dieH = (dieBounds ? Math.round(dieBounds.max_y - dieBounds.min_y) : null) || plan.die?.height_mm || 200;

    // Chuẩn bị nội dung SVG dieline để tái sử dụng
    let cleanDielineInner = '';
    let dielineStyles = '';
    let dielineVb = '';

    if (dielineSvg) {
      // 1. Trích xuất <style> nếu có để đưa vào <defs>
      const styleMatch = dielineSvg.match(/<style>([\s\S]*?)<\/style>/i);
      if (styleMatch) {
        dielineStyles = styleMatch[1];
      }

      // 2. Làm sạch nội dung dieline:
      // - Loại bỏ khai báo XML và thẻ <style>
      // - QUAN TRỌNG: Loại bỏ hoàn toàn lớp kích thước/thước đo CAD (layer-dimensions)
      // - Loại bỏ thẻ <svg> bao ngoài và </svg>
      cleanDielineInner = dielineSvg
        .replace(/<\?xml[^>]*\?>/gi, '')
        .replace(/<style>[\s\S]*?<\/style>/gi, '')
        .replace(/<g[^>]*id=["']layer-dimensions["'][^>]*>[\s\S]*?<\/g>/gi, '')
        .replace(/<g[^>]*class=["'][^"']*dimensions[^"']*["'][^>]*>[\s\S]*?<\/g>/gi, '')
        .replace(/<svg[^>]*>/i, '')
        .replace(/<\/svg>\s*$/i, '');

      // 3. ViewBox CHUẨN: Bắt buộc lấy chính xác theo bounds thực tế của khuôn bế (dieBounds)
      // Không dùng viewBox có padding thước đo của iso_svg
      if (dieBounds) {
        const bx = dieBounds.min_x ?? 0;
        const by = dieBounds.min_y ?? 0;
        const bw = (dieBounds.max_x - dieBounds.min_x) || dieW;
        const bh = (dieBounds.max_y - dieBounds.min_y) || dieH;
        dielineVb = `${bx} ${by} ${bw} ${bh}`;
      } else {
        dielineVb = `0 0 ${dieW} ${dieH}`;
      }
    }

    // Xây dựng mảng placements (tự tính toán nếu API trả về dạng grid đơn giản)
    let placements = (plan.placements && plan.placements.length > 0) ? plan.placements : [];

    if (placements.length === 0) {
      const cols = plan.columns || 1;
      const rows = plan.rows || 1;
      const isRot = Boolean(plan.rotated);

      const cellW = isRot ? dieH : dieW;
      const cellH = isRot ? dieW : dieH;

      const totalGridW = cols * cellW + (cols - 1) * gutterX;
      const totalGridH = rows * cellH + (rows - 1) * gutterY;

      const startX = mLeft + Math.max(0, (usableW - totalGridW) / 2);
      const startY = mTop + Math.max(0, (usableH - totalGridH) / 2);

      let count = 0;
      const maxUps = plan.ups || plan.ups_per_sheet || (cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (count >= maxUps) break;
          placements.push({
            x_mm: startX + c * (cellW + gutterX),
            y_mm: startY + r * (cellH + gutterY),
            width_mm: cellW,
            height_mm: cellH,
            rotation_deg: isRot ? 90 : 0,
          });
          count++;
        }
      }
    }

    // Tạo mã SVG cho sơ đồ bình trang
    const svgMarkup = `
      <svg id="imposition-press-sheet" viewBox="0 0 ${sheetW} ${sheetH}" width="${sheetW}" height="${sheetH}" xmlns="http://www.w3.org/2000/svg" style="position: absolute; left: 0; top: 0; display: block; overflow: visible; box-shadow: 0 10px 30px rgba(0,0,0,0.12); border-radius: 4px; pointer-events: none;">
        <defs>
          <pattern id="gripper-stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#a1a1aa" stroke-width="1" opacity="0.25" />
          </pattern>
          <style>
            .cut, #layer-cut path, [data-layer="cut"] { stroke: #dc2626; stroke-width: 0.25; fill: none; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
            .crease, #layer-crease path, [data-layer="crease"] { stroke: #2563eb; stroke-width: 0.20; stroke-dasharray: 3.5 2; fill: none; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
            .bleed, #layer-bleed path { stroke: #059669; stroke-width: 0.20; fill: none; opacity: 0.6; }
            .faces, #layer-substrate path { fill: #ffffff; stroke: none; }
            #layer-dimensions, .layer-dimensions { display: none !important; }
            ${dielineStyles}
          </style>
        </defs>

        <!-- Lớp tờ in (Sheet background) -->
        <g class="layer-sheet" style="${this.layers.sheet ? '' : 'display:none'}">
          <rect x="0" y="0" width="${sheetW}" height="${sheetH}" fill="#ffffff" stroke="#27272a" stroke-width="1" />
          <!-- Thước đo viền tờ -->
          <text x="${sheetW / 2}" y="-10" text-anchor="middle" font-family="monospace" font-size="11" font-weight="600" fill="#71717a">${sheetW} mm</text>
          <text x="-10" y="${sheetH / 2}" text-anchor="middle" font-family="monospace" font-size="11" font-weight="600" fill="#71717a" transform="rotate(-90 -10 ${sheetH / 2})">${sheetH} mm</text>
        </g>

        <!-- Lớp vùng in khả dụng (Usable printable area) -->
        <g class="layer-margins" style="${this.layers.margins ? '' : 'display:none'}">
          <rect x="${mLeft}" y="${mTop}" width="${usableW}" height="${usableH}" fill="#fafafa" stroke="#cbd5e1" stroke-width="0.8" stroke-dasharray="4 3" />
        </g>

        <!-- Lớp nhíp in (Gripper strip) -->
        <g class="layer-gripper" style="${this.layers.gripper ? '' : 'display:none'}">
          ${gripperEdge === 'bottom' ? `
            <rect x="0" y="${sheetH - grip}" width="${sheetW}" height="${grip}" fill="url(#gripper-stripes)" stroke="#a1a1aa" stroke-width="0.6" />
            <text x="${sheetW / 2}" y="${sheetH - grip / 2 + 3}" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="500" fill="#71717a" letter-spacing="1">NHÍP IN (GRIPPER ${grip}mm)</text>
          ` : `
            <rect x="0" y="0" width="${grip}" height="${sheetH}" fill="url(#gripper-stripes)" stroke="#a1a1aa" stroke-width="0.6" />
            <text x="${grip / 2 + 3}" y="${sheetH / 2}" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="500" fill="#71717a" transform="rotate(-90 ${grip / 2 + 3} ${sheetH / 2})" letter-spacing="1">NHÍP IN (GRIPPER ${grip}mm)</text>
          `}
        </g>

        <!-- Lớp sắp xếp các con phôi (Placements) -->
        <g class="layer-placements">
          ${placements.map((p, idx) => {
            const x = p.x_mm;
            const y = p.y_mm;
            const w = p.width_mm;
            const h = p.height_mm;
            const rot = p.rotation_deg || 0;

            let rotTransform = '';
            if (rot === 90) {
              rotTransform = `translate(${w} 0) rotate(90)`;
            } else if (rot === 180) {
              rotTransform = `translate(${w} ${h}) rotate(180)`;
            } else if (rot === 270) {
              rotTransform = `translate(0 ${h}) rotate(270)`;
            }

            return `
              <g class="placement-tile" transform="translate(${x} ${y})">
                <!-- Khung bao phôi cắt (Cell) -->
                <g class="layer-cells" style="${this.layers.cells ? '' : 'display:none'}">
                  <rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff" stroke="#94a3b8" stroke-width="0.6" stroke-dasharray="4 2" />
                </g>

                <!-- Lồng dieline vector: chuẩn kích thước dieW x dieH, vừa khít khung phôi -->
                <g class="layer-dielines" style="${this.layers.dielines ? '' : 'display:none'}">
                  ${cleanDielineInner ? `
                    <g transform="${rotTransform}">
                      <svg x="0" y="0" width="${dieW}" height="${dieH}" viewBox="${dielineVb}" preserveAspectRatio="none">
                        ${cleanDielineInner}
                      </svg>
                    </g>
                  ` : ''}
                </g>

                <!-- Số thứ tự con hộp -->
                <g class="layer-labels" style="${this.layers.labels ? '' : 'display:none'}">
                  <rect x="3" y="3" width="22" height="15" rx="3" fill="#09090b" opacity="0.9" />
                  <text x="14" y="14" text-anchor="middle" font-family="monospace" font-size="9" font-weight="600" fill="#ffffff">#${idx + 1}</text>
                </g>
              </g>
            `;
          }).join('')}
        </g>
      </svg>
    `;

    this.stage.innerHTML = svgMarkup;
    this.svgElement = this.stage.querySelector('svg');

    this.fitView();
    this.hasFitted = true;
  }

  /**
   * Áp dụng transform cho stage
   * @private
   */
  _applyTransform() {
    this.stage.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
  }

  /**
   * Căn giữa và vừa vặn khung hình
   */
  fitView() {
    if (!this.svgElement || !this.sheetSize) return;

    const rect = this.container.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    if (cw <= 0 || ch <= 0) return;

    const { sw, sh } = this.sheetSize;

    const padding = 40;
    const availW = Math.max(50, cw - padding * 2);
    const availH = Math.max(50, ch - padding * 2);

    const scale = Math.min(availW / sw, availH / sh);
    this.zoom = scale;

    this.pan = {
      x: (cw - sw * scale) / 2,
      y: (ch - sh * scale) / 2,
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
   * Đặt zoom cụ thể
   */
  setZoom(newZoom) {
    const rect = this.container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const clampedZoom = Math.max(0.05, Math.min(10.0, newZoom));
    this.pan.x = cx - (cx - this.pan.x) * (clampedZoom / this.zoom);
    this.pan.y = cy - (cy - this.pan.y) * (clampedZoom / this.zoom);
    this.zoom = clampedZoom;

    this._applyTransform();
  }

  /**
   * Bật/tắt lớp hiển thị
   */
  toggleLayer(layerName, visible) {
    if (this.layers[layerName] === undefined) return;
    this.layers[layerName] = Boolean(visible);

    if (!this.svgElement) return;
    const selector = `.layer-${layerName}`;
    const el = this.svgElement.querySelectorAll(selector);
    el.forEach((item) => {
      item.style.display = this.layers[layerName] ? '' : 'none';
    });
  }

  /**
   * Dọn dẹp bộ nhớ
   */
  dispose() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.container.innerHTML = '';
  }
}
