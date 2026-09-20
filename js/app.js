/**
 * INHANH API - Client Application Coordinator
 * 
 * Điều phối toàn bộ hoạt động của ứng dụng:
 * - Quản lý cấu hình API Key & Base URL (lưu localStorage)
 * - Tải thư viện mẫu ECMA / FEFCO từ server
 * - Đồng bộ luồng tính toán: Biên dịch 2D/3D & Giải bài toán bình trang
 * - Tương tác UI đa tab: 2D Dieline, 3D Folding, Bình Trang, Split View & Tạo Code Snippet
 */

import { InhanhClient } from './inhanh-api.js';
import { Viewer2D } from './viewer-2d.js';
import { Viewer3D } from './viewer-3d.js';
import { ViewerImposition } from './viewer-imposition.js';

// Các khổ giấy in offset phổ biến tại Việt Nam
const SHEET_PRESETS = [
  { id: '65x86', name: 'Khổ máy 650 × 860 mm', w: 650, h: 860 },
  { id: '79x109', name: 'Khổ máy 790 × 1090 mm', w: 790, h: 1090 },
  { id: '54x79', name: 'Khổ máy 540 × 790 mm', w: 540, h: 790 },
  { id: 'A1', name: 'Khổ A1 (594 × 841 mm)', w: 594, h: 841 },
  { id: 'A2', name: 'Khổ A2 (420 × 594 mm)', w: 420, h: 594 },
  { id: 'CUSTOM', name: 'Tùy chỉnh kích thước...', w: 650, h: 860 },
];

class App {
  constructor() {
    // Đọc cấu hình từ LocalStorage (nếu chạy qua server proxy cục bộ thì ưu tiên proxy)
    const isLocalServer = typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http') && window.location.host.includes('localhost:8080');
    const defaultUrl = isLocalServer ? window.location.origin : 'https://inhanh.com';
    const savedUrl = localStorage.getItem('inhanh_base_url') || defaultUrl;
    const savedKey = localStorage.getItem('inhanh_api_key') || 'ink_live_5u6kug93r8e7kitzwdkol9grfslx32fk';

    this.client = new InhanhClient({ baseUrl: savedUrl, apiKey: savedKey });

    this.specsList = [];
    this.selectedSpec = null;
    this.compileData = null;
    this.impositionPlans = [];
    this.selectedPlanIndex = 0;
    this.isAutoFolding = false;
    this.foldDirection = 1;

    // Tự động tính toán (Debounce 350ms để mượt mà khi người dùng gõ số)
    this.debouncedCompile = this._debounce(() => this.compileCurrentModel(), 350);
    this.debouncedSolveImposition = this._debounce(() => this.solveImposition(), 350);

    this._cacheDom();
    this._initViewers();
    this._bindEvents();
    this._loadInitialData();
  }

  /**
   * Trì hoãn thực thi để gom các lần gõ số liên tiếp
   * @private
   */
  _debounce(func, wait = 350) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  /**
   * Lưu các tham chiếu DOM
   * @private
   */
  _cacheDom() {
    this.dom = {
      // Topbar & API Config Popover
      apiUrlInput: document.getElementById('api-base-url'),
      apiKeyInput: document.getElementById('api-key-input'),
      toggleKeyVisibilityBtn: document.getElementById('btn-toggle-key-visibility'),
      saveConfigBtn: document.getElementById('btn-save-config'),
      apiConfigToggleBtn: document.getElementById('btn-api-config-toggle'),
      apiConfigPopover: document.getElementById('api-config-popover'),
      connectionStatus: document.getElementById('connection-status'),
      quotaBadge: document.getElementById('quota-badge'),
      pointsBadge: document.getElementById('points-badge'),

      // Model & Parameters
      modelSelect: document.getElementById('model-select'),
      modelDescription: document.getElementById('model-desc'),
      dimInputsContainer: document.getElementById('dimension-inputs-container'),
      compileSpinner: document.getElementById('compile-spinner'),

      // Panels
      panelBoxParams: document.getElementById('panel-box-params'),
      panelImpositionParams: document.getElementById('panel-imposition-params'),

      // Imposition Config
      sheetPresetSelect: document.getElementById('sheet-preset-select'),
      sheetWidthInput: document.getElementById('sheet-width'),
      sheetHeightInput: document.getElementById('sheet-height'),
      gripperMarginInput: document.getElementById('gripper-margin'),
      gutterInput: document.getElementById('gutter-size'),
      targetQuantityInput: document.getElementById('target-quantity'),
      impositionSpinner: document.getElementById('imposition-spinner'),

      // Tab switcher
      tabButtons: document.querySelectorAll('.tab-btn'),
      tabViews: {
        '2d': document.getElementById('view-2d'),
        '3d': document.getElementById('view-3d'),
        'imposition': document.getElementById('view-imposition'),
        'code': document.getElementById('view-code'),
      },

      // Containers
      container2d: document.getElementById('container-2d'),
      container3d: document.getElementById('container-3d'),
      containerImp: document.getElementById('container-imposition'),

      // 2D Controls
      zoomIn2d: document.getElementById('btn-zoom-in-2d'),
      zoomOut2d: document.getElementById('btn-zoom-out-2d'),
      fitView2d: document.getElementById('btn-fit-2d'),
      downloadSvgBtn: document.getElementById('btn-download-svg'),
      layerCut: document.getElementById('layer-cut'),
      layerCrease: document.getElementById('layer-crease'),
      layerBleed: document.getElementById('layer-bleed'),
      layerDim: document.getElementById('layer-dim'),

      // 3D Controls
      foldSlider: document.getElementById('fold-slider'),
      foldValueLabel: document.getElementById('fold-value-label'),
      btnPlayFold: document.getElementById('btn-play-fold'),
      btnResetCam3d: document.getElementById('btn-reset-cam-3d'),
      btnScreenshot3d: document.getElementById('btn-screenshot-3d'),
      btnWireframe3d: document.getElementById('btn-wireframe-3d'),
      btnAutoRotate3d: document.getElementById('btn-auto-rotate-3d'),
      paperColorSelect: document.getElementById('paper-color-select'),

      // Imposition Controls & Stats
      zoomInImp: document.getElementById('btn-zoom-in-imp'),
      zoomOutImp: document.getElementById('btn-zoom-out-imp'),
      fitViewImp: document.getElementById('btn-fit-imp'),
      impPlansSelect: document.getElementById('imp-plans-select'),
      statUps: document.getElementById('stat-ups'),
      statUtil: document.getElementById('stat-util'),
      statSheets: document.getElementById('stat-sheets'),
      statImpressions: document.getElementById('stat-impressions'),

      // Export Actions
      btnDownloadDxf: document.getElementById('btn-download-dxf'),
      btnDownloadCff2: document.getElementById('btn-download-cff2'),
      btnDownloadPdf: document.getElementById('btn-download-pdf'),

      // Code preview
      codeSnippet: document.getElementById('code-snippet'),
      btnCopyCode: document.getElementById('btn-copy-code'),
    };
  }

  /**
   * Khởi tạo các Viewers 2D, 3D, Imposition
   * @private
   */
  _initViewers() {
    this.viewer2d = new Viewer2D(this.dom.container2d);
    this.viewer3d = new Viewer3D(this.dom.container3d);
    this.viewerImp = new ViewerImposition(this.dom.containerImp);

    // Điền sẵn cấu hình vào input
    this.dom.apiUrlInput.value = this.client.baseUrl;
    this.dom.apiKeyInput.value = this.client.apiKey;

    // Nạp danh mục khổ giấy vào dropdown
    this.dom.sheetPresetSelect.innerHTML = SHEET_PRESETS.map(
      s => `<option value="${s.id}">${s.name}</option>`
    ).join('');
  }

  /**
   * Gắn các sự kiện tương tác giao diện
   * @private
   */
  _bindEvents() {
    // 1. Quản lý API Key & Base URL
    if (this.dom.apiConfigToggleBtn && this.dom.apiConfigPopover) {
      this.dom.apiConfigToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dom.apiConfigPopover.classList.toggle('show');
      });

      document.addEventListener('click', (e) => {
        if (!this.dom.apiConfigPopover.contains(e.target) && e.target !== this.dom.apiConfigToggleBtn) {
          this.dom.apiConfigPopover.classList.remove('show');
        }
      });
    }

    this.dom.saveConfigBtn.addEventListener('click', () => {
      const url = this.dom.apiUrlInput.value.trim();
      const key = this.dom.apiKeyInput.value.trim();
      this.client.setBaseUrl(url);
      this.client.setApiKey(key);
      localStorage.setItem('inhanh_base_url', url);
      localStorage.setItem('inhanh_api_key', key);
      if (this.dom.apiConfigPopover) {
        this.dom.apiConfigPopover.classList.remove('show');
      }
      this._showToast('Đã lưu cấu hình API Key!');
      this._loadInitialData();
    });

    this.dom.toggleKeyVisibilityBtn.addEventListener('click', () => {
      const isPass = this.dom.apiKeyInput.type === 'password';
      this.dom.apiKeyInput.type = isPass ? 'text' : 'password';
      this.dom.toggleKeyVisibilityBtn.textContent = isPass ? 'Ẩn' : 'Hiện';
    });

    // 2. Chuyển đổi Tab (2D / 3D / Bình Trang / Split)
    this.dom.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this._switchTab(tab);
      });
    });

    // 3. Chọn mẫu bao bì -> Tự động biên dịch ngay
    this.dom.modelSelect.addEventListener('change', (e) => {
      const modelId = e.target.value;
      this._onModelChanged(modelId);
      this.compileCurrentModel();
    });

    // 4. Khổ in & Thông số bình trang -> Tự động tính toán khi thay đổi
    this.dom.sheetPresetSelect.addEventListener('change', (e) => {
      const selected = SHEET_PRESETS.find(s => s.id === e.target.value);
      if (selected && selected.id !== 'CUSTOM') {
        this.dom.sheetWidthInput.value = selected.w;
        this.dom.sheetHeightInput.value = selected.h;
      }
      this.solveImposition();
    });

    const impInputs = [
      this.dom.sheetWidthInput,
      this.dom.sheetHeightInput,
      this.dom.gripperMarginInput,
      this.dom.gutterInput,
      this.dom.targetQuantityInput,
    ];

    const handleImpInput = (e) => {
      const target = e.target;
      if (target === this.dom.sheetWidthInput || target === this.dom.sheetHeightInput) {
        this.dom.sheetPresetSelect.value = 'CUSTOM';
      }
      this.debouncedSolveImposition();
    };

    impInputs.forEach(input => {
      if (input) {
        input.addEventListener('input', handleImpInput);
        input.addEventListener('change', handleImpInput);
      }
    });

    this.dom.impPlansSelect.addEventListener('change', (e) => {
      this.selectedPlanIndex = parseInt(e.target.value, 10);
      this._displaySelectedImpositionPlan();
    });

    // 6. Điều khiển View 2D
    this.dom.zoomIn2d.addEventListener('click', () => this.viewer2d.zoomIn());
    this.dom.zoomOut2d.addEventListener('click', () => this.viewer2d.zoomOut());
    this.dom.fitView2d.addEventListener('click', () => this.viewer2d.fitView());
    this.dom.downloadSvgBtn.addEventListener('click', () => {
      const id = this.selectedSpec?.id || 'dieline';
      this.viewer2d.downloadSvg(`${id}.svg`);
    });

    this.dom.layerCut.addEventListener('change', (e) => this.viewer2d.toggleLayer('cut', e.target.checked));
    this.dom.layerCrease.addEventListener('change', (e) => this.viewer2d.toggleLayer('crease', e.target.checked));
    this.dom.layerBleed.addEventListener('change', (e) => this.viewer2d.toggleLayer('bleed', e.target.checked));
    this.dom.layerDim.addEventListener('change', (e) => this.viewer2d.toggleLayer('dimensions', e.target.checked));

    // 7. Điều khiển View 3D
    this.dom.foldSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.dom.foldValueLabel.textContent = `${Math.round(val * 100)}%`;
      this.viewer3d.applyFold(val);
    });

    this.dom.btnPlayFold.addEventListener('click', () => {
      this._toggleAutoFolding();
    });

    this.dom.btnResetCam3d.addEventListener('click', () => this.viewer3d.resetCamera());
    this.dom.btnScreenshot3d.addEventListener('click', () => {
      const id = this.selectedSpec?.id || 'box';
      this.viewer3d.screenshot(`3d-render-${id}.png`);
    });
    this.dom.btnWireframe3d.addEventListener('click', () => {
      const active = this.viewer3d.toggleWireframe();
      this.dom.btnWireframe3d.classList.toggle('active-btn', active);
    });
    this.dom.btnAutoRotate3d.addEventListener('click', () => {
      const active = this.viewer3d.toggleAutoRotate();
      this.dom.btnAutoRotate3d.classList.toggle('active-btn', active);
    });
    this.dom.paperColorSelect.addEventListener('change', (e) => {
      this.viewer3d.setPaperColor(e.target.value);
    });

    // 8. Điều khiển View Bình Trang
    this.dom.zoomInImp.addEventListener('click', () => this.viewerImp.zoomIn());
    this.dom.zoomOutImp.addEventListener('click', () => this.viewerImp.zoomOut());
    this.dom.fitViewImp.addEventListener('click', () => this.viewerImp.fitView());

    // 9. Tải file xuất CAD / PDF
    this.dom.btnDownloadDxf.addEventListener('click', () => this._downloadFile('dxf'));
    this.dom.btnDownloadCff2.addEventListener('click', () => this._downloadFile('cff2'));
    this.dom.btnDownloadPdf.addEventListener('click', () => this._downloadFile('pdf'));

    // 10. Copy code snippet
    this.dom.btnCopyCode.addEventListener('click', () => {
      navigator.clipboard.writeText(this.dom.codeSnippet.textContent);
      this._showToast('Đã sao chép mã tích hợp vào Clipboard!');
    });
  }

  /**
   * Chuyển tab hiển thị
   * @private
   */
  _switchTab(tab) {
    this.dom.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    Object.keys(this.dom.tabViews).forEach(key => {
      const el = this.dom.tabViews[key];
      if (el) {
        el.classList.toggle('hidden', key !== tab);
      }
    });

    // Chỉ hiển thị thông số bình trang khi chuyển qua tab bình trang (imposition)
    const isImposition = tab === 'imposition';
    if (this.dom.panelImpositionParams) {
      this.dom.panelImpositionParams.classList.toggle('hidden', !isImposition);
    }

    // Kích hoạt fitView hoặc resize cho viewer tương ứng
    setTimeout(() => {
      if (tab === '2d') this.viewer2d.fitView();
      if (tab === 'imposition') {
        if (this.compileData && (!this.impositionPlans || this.impositionPlans.length === 0)) {
          this.solveImposition();
        }
        this.viewerImp.fitView();
      }
    }, 50);
  }

  /**
   * Tải danh mục mẫu từ API
   * @private
   */
  async _loadInitialData() {
    this.dom.connectionStatus.textContent = 'Đang kiểm tra kết nối...';
    this.dom.connectionStatus.className = 'status-badge status-loading';

    try {
      this.specsList = await this.client.getSpecs();
      this.dom.connectionStatus.textContent = 'Đã kết nối API';
      this.dom.connectionStatus.className = 'status-badge status-online';

      this._populateModelDropdown();

      // Mặc định chọn mẫu đầu tiên hoặc ECMA_A30
      const defaultId = this.specsList.some(s => s.id === 'ECMA_A30') ? 'ECMA_A30' : this.specsList[0]?.id;
      if (defaultId) {
        this.dom.modelSelect.value = defaultId;
        this._onModelChanged(defaultId);
        // Tự động biên dịch lần đầu
        await this.compileCurrentModel();
      }
    } catch (err) {
      this.dom.connectionStatus.textContent = 'Mất kết nối hoặc sai Key';
      this.dom.connectionStatus.className = 'status-badge status-offline';
      console.error('Không thể nạp danh mục mẫu:', err);
      this._showToast(err.message, 'error');
    }
  }

  /**
   * Đổ dữ liệu mẫu vào Dropdown
   * @private
   */
  _populateModelDropdown() {
    const groups = {};
    for (const spec of this.specsList) {
      const cat = spec.category || spec.standard || 'Khác';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(spec);
    }

    let html = '';
    for (const [cat, specs] of Object.entries(groups)) {
      html += `<optgroup label="${cat}">`;
      for (const s of specs) {
        html += `<option value="${s.id}">${s.id} - ${s.name || s.standard_code || ''}</option>`;
      }
      html += `</optgroup>`;
    }
    this.dom.modelSelect.innerHTML = html;
  }

  /**
   * Cập nhật khi người dùng chọn mẫu khác
   * @private
   */
  _onModelChanged(modelId) {
    const spec = this.specsList.find(s => s.id === modelId);
    if (!spec) return;
    this.selectedSpec = spec;

    this.dom.modelDescription.textContent = spec.description || `${spec.name || spec.id} (Tiêu chuẩn ${spec.standard || 'ECMA/FEFCO'})`;

    // Tạo các ô nhập kích thước theo tham số của mẫu
    this._renderDimensionInputs(spec);
    this._updateCodeSnippet();
  }

  /**
   * Tạo các trường nhập liệu kích thước Dài x Rộng x Cao
   * @private
   */
  _renderDimensionInputs(spec) {
    const params = spec.parameters || {};
    let html = '';

    // Ưu tiên thứ tự L -> W -> H -> T
    const order = ['L', 'W', 'H', 'T'];
    const keys = Object.keys(params).sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });

    const labelMap = {
      'L': 'Dài (L)',
      'W': 'Rộng (W)',
      'H': 'Cao (H)',
      'T': 'Dày giấy (T)'
    };

    for (const key of keys) {
      const p = params[key];
      let label = labelMap[key];
      if (!label) {
        const raw = p.label || key;
        const match = raw.match(/\((.*?)\)/);
        label = match ? `${match[1]} (${key})` : `${raw} (${key})`;
      }

      const defVal = p.default ?? 100;
      const minVal = p.min ?? 10;
      const maxVal = p.max ?? 1000;
      const step = p.step ?? 0.5;
      const unit = p.unit || 'mm';

      html += `
        <div class="dim-item">
          <div class="dim-header">
            <label for="param-${key}">${label}</label>
            <span class="dim-range" title="Giới hạn: ${minVal} - ${maxVal} ${unit}">${minVal}-${maxVal}</span>
          </div>
          <div class="input-unit-wrapper">
            <input type="number" id="param-${key}" data-key="${key}" value="${defVal}" min="${minVal}" max="${maxVal}" step="${step}" class="param-input" />
            <span class="unit-suffix">${unit}</span>
          </div>
        </div>
      `;
    }

    this.dom.dimInputsContainer.innerHTML = html;

    // Gắn sự kiện tự động tính toán khi thay đổi kích thước
    const handleDimInput = () => {
      this._updateCodeSnippet();
      this.debouncedCompile();
    };

    this.dom.dimInputsContainer.querySelectorAll('.param-input').forEach(input => {
      input.addEventListener('input', handleDimInput);
      input.addEventListener('change', handleDimInput);
    });
  }

  /**
   * Thu thập kích thước hiện tại từ form
   * @private
   * @returns {Object|null} Trả về null nếu có trường chưa hợp lệ
   */
  _collectCurrentDimensions() {
    const dims = {};
    const inputs = this.dom.dimInputsContainer.querySelectorAll('.param-input');
    let hasInvalid = false;
    inputs.forEach(input => {
      const val = parseFloat(input.value);
      if (isNaN(val) || val <= 0) {
        hasInvalid = true;
      }
      dims[input.dataset.key] = val || 0;
    });
    if (hasInvalid) return null;
    return dims;
  }

  /**
   * Gọi API /v1/engine/compile để tạo 2D và 3D
   */
  async compileCurrentModel() {
    if (!this.selectedSpec) return;

    const modelId = this.selectedSpec.id;
    const dimensions = this._collectCurrentDimensions();
    if (!dimensions) return; // Đang gõ dở dang hoặc chưa hợp lệ, đợi người dùng nhập xong

    if (this.dom.compileSpinner) {
      this.dom.compileSpinner.classList.remove('hidden');
    }

    try {
      const result = await this.client.compile({
        modelId,
        dimensions,
        iso: true,
      });

      this.compileData = result;

      // Cập nhật View 2D
      const svgToRender = result.iso_svg || result.svg;
      this.viewer2d.render(svgToRender, result.bounds);

      // Cập nhật View 3D
      if (result.scene?.tree) {
        this.viewer3d.render(result.scene.tree);
      }

      // Cập nhật thông số kỹ thuật lên UI
      this._updateBillingBadges();
      this._updateCodeSnippet();

      // Tự động giải bình trang theo kích thước mới của hộp
      await this.solveImposition();
    } catch (err) {
      console.error('Lỗi khi biên dịch:', err);
      this._showToast(err.message, 'error');
    } finally {
      if (this.dom.compileSpinner) {
        this.dom.compileSpinner.classList.add('hidden');
      }
    }
  }

  /**
   * Giải bài toán bình trang N-up
   */
  async solveImposition() {
    if (!this.compileData) return;

    const bounds = this.compileData.bounds;
    const dieW = Math.round(bounds.max_x - bounds.min_x);
    const dieH = Math.round(bounds.max_y - bounds.min_y);

    const sheetW = parseFloat(this.dom.sheetWidthInput.value);
    const sheetH = parseFloat(this.dom.sheetHeightInput.value);
    const grip = parseFloat(this.dom.gripperMarginInput.value);
    const gutter = parseFloat(this.dom.gutterInput.value);
    const qty = parseInt(this.dom.targetQuantityInput.value, 10);

    // Kiểm tra hợp lệ trước khi tính toán
    if (isNaN(sheetW) || isNaN(sheetH) || isNaN(grip) || isNaN(gutter) || isNaN(qty) || sheetW <= 0 || sheetH <= 0 || qty <= 0) {
      return;
    }

    if (this.dom.impositionSpinner) {
      this.dom.impositionSpinner.classList.remove('hidden');
    }

    try {
      const sheet = {
        sheet_width_mm: sheetW,
        sheet_height_mm: sheetH,
        gutter_x_mm: gutter,
        gutter_y_mm: gutter,
        gripper_margin_mm: grip,
        allow_rotation: true,
      };

      const plans = await this.client.imposition({
        dieWidthMm: dieW,
        dieHeightMm: dieH,
        sheets: [sheet],
        plan: {
          target_quantity: qty,
          mode: 'simplex',
        },
        modelId: this.compileData.model_id,
        dimensions: this._collectCurrentDimensions() || undefined,
      });

      this.impositionPlans = Array.isArray(plans) ? plans : (plans.plans || [plans]);
      this.selectedPlanIndex = 0;

      this._populateImpositionPlanDropdown();
      this._displaySelectedImpositionPlan();
      this._updateBillingBadges();
    } catch (err) {
      console.error('Lỗi bình trang:', err);
      this._showToast(err.message, 'error');
    } finally {
      if (this.dom.impositionSpinner) {
        this.dom.impositionSpinner.classList.add('hidden');
      }
    }
  }

  /**
   * Đổ danh sách các phương án bình trang vào dropdown
   * @private
   */
  _populateImpositionPlanDropdown() {
    this.dom.impPlansSelect.innerHTML = this.impositionPlans.map((p, i) => {
      const ups = p.ups_per_sheet || p.columns * p.rows || 0;
      const util = Math.round((p.utilisation_percent || 0) * 10) / 10;
      const rot = p.rotated ? ' (Xoay 90°)' : '';
      return `<option value="${i}">Phương án ${i + 1}: ${ups} con/tờ (${util}%)${rot}</option>`;
    }).join('');
  }

  /**
   * Hiển thị phương án bình trang đã chọn
   * @private
   */
  _displaySelectedImpositionPlan() {
    const plan = this.impositionPlans[this.selectedPlanIndex];
    if (!plan) return;

    // Render ra canvas SVG: Ưu tiên dùng SVG khuôn bế thuần (không chứa thước đo kích thước)
    const dielineSvgForImp = this.compileData?.svg || this.compileData?.iso_svg || '';
    this.viewerImp.render(
      plan,
      dielineSvgForImp,
      this.compileData?.bounds || null
    );

    // Cập nhật bảng thống kê
    const ups = plan.ups_per_sheet || (plan.columns * plan.rows) || 0;
    const util = Math.round((plan.utilisation_percent || 0) * 10) / 10;
    const totalSheets = plan.total_sheets || 0;
    const totalImpressions = plan.total_impressions || totalSheets;

    this.dom.statUps.textContent = `${ups} con`;
    this.dom.statUtil.textContent = `${util}%`;
    this.dom.statSheets.textContent = `${totalSheets} tờ (${(totalSheets / 500).toFixed(1)} ram)`;
    this.dom.statImpressions.textContent = `${totalImpressions} lượt`;
  }

  /**
   * Chạy animation gập mở tự động
   * @private
   */
  _toggleAutoFolding() {
    this.isAutoFolding = !this.isAutoFolding;
    this.dom.btnPlayFold.textContent = this.isAutoFolding ? 'Tạm dừng' : 'Tự động gập';

    if (this.isAutoFolding) {
      let currentVal = parseFloat(this.dom.foldSlider.value);
      const step = () => {
        if (!this.isAutoFolding) return;

        currentVal += 0.008 * this.foldDirection;
        if (currentVal >= 1.0) {
          currentVal = 1.0;
          this.foldDirection = -1;
        } else if (currentVal <= 0.0) {
          currentVal = 0.0;
          this.foldDirection = 1;
        }

        this.dom.foldSlider.value = currentVal;
        this.dom.foldValueLabel.textContent = `${Math.round(currentVal * 100)}%`;
        this.viewer3d.applyFold(currentVal);

        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  /**
   * Tải file kỹ thuật CAD/PDF qua endpoint GET /v1/engine/download
   * @private
   */
  _downloadFile(format) {
    if (!this.selectedSpec) return;
    const modelId = this.selectedSpec.id;
    const dimensions = this._collectCurrentDimensions();
    const url = this.client.getDownloadUrl({ modelId, format, dimensions, download: true });
    window.open(url, '_blank');
  }

  /**
   * Cập nhật thông tin Quota & Billing lên giao diện
   * @private
   */
  _updateBillingBadges() {
    const info = this.client.lastBillingInfo;
    if (info) {
      this.dom.quotaBadge.textContent = `Quota: -${info.quotaCost}`;
      if (info.pointsBalance !== null) {
        this.dom.pointsBadge.textContent = `Point: ${info.pointsBalance.toLocaleString('vi-VN')}`;
        this.dom.pointsBadge.classList.remove('hidden');
      }
    }
  }

  /**
   * Tự động sinh đoạn code tích hợp mẫu (cURL & Fetch)
   * @private
   */
  _updateCodeSnippet() {
    if (!this.selectedSpec) return;
    const modelId = this.selectedSpec.id;
    const dims = this._collectCurrentDimensions();
    const baseUrl = this.client.baseUrl;
    const key = this.client.apiKey || 'ink_live_5u6kug93r8e7kitzwdkol9grfslx32fk';

    const snippet = `// 1. Gọi biên dịch khuôn bế 2D & mô hình 3D
const response = await fetch('${baseUrl}/v1/engine/compile?iso=1', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': '${key}'
  },
  body: JSON.stringify({
    model_id: '${modelId}',
    dimensions: ${JSON.stringify(dims, null, 2)}
  })
});

const result = await response.json();
console.log('SVG 2D:', result.data.svg);
console.log('Scene 3D Kinematics:', result.data.scene.tree);

// 2. Tính toán bình trang N-up tối ưu
const impResponse = await fetch('${baseUrl}/v1/engine/imposition', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': '${key}'
  },
  body: JSON.stringify({
    die_width_mm: Math.round(result.data.bounds.max_x - result.data.bounds.min_x),
    die_height_mm: Math.round(result.data.bounds.max_y - result.data.bounds.min_y),
    sheets: [{
      sheet_width_mm: 650,
      sheet_height_mm: 860,
      gutter_x_mm: 5,
      gutter_y_mm: 5,
      gripper_margin_mm: 10
    }],
    plan: { target_quantity: 1000, mode: 'simplex' }
  })
});
const impResult = await impResponse.json();
console.log('Phương án bình trang:', impResult.data);`;

    this.dom.codeSnippet.textContent = snippet;
  }

  /**
   * Thông báo Toast nhẹ
   * @private
   */
  _showToast(msg, type = 'success') {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      document.body.appendChild(toast);
    }
    toast.className = `toast-msg toast-${type} show`;
    toast.textContent = msg;
    setTimeout(() => {
      toast.className = `toast-msg toast-${type}`;
    }, 3500);
  }
}

// Khởi chạy ứng dụng khi DOM sẵn sàng
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
