/**
 * INHANH API - Client SDK Module (Vanilla JS / ESM)
 * 
 * Thư viện giao tiếp chuẩn với INHANH API thông qua API Key (ink_live_...).
 * Hỗ trợ tra cứu specs mẫu, compile 2D/3D dieline, tính toán bình trang và xuất file CAD/PDF.
 */

export class InhanhClient {
  /**
   * @param {Object} options
   * @param {string} [options.baseUrl='https://inhanh.com'] - Base URL của INHANH API
   * @param {string} [options.apiKey='ink_live_5u6kug93r8e7kitzwdkol9grfslx32fk'] - API Key (ink_live_...)
   */
  constructor({ baseUrl = 'https://inhanh.com', apiKey = 'ink_live_5u6kug93r8e7kitzwdkol9grfslx32fk' } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey.trim();
    this.lastBillingInfo = {
      quotaCost: 0,
      pointsBalance: null,
      rateLimitRemaining: null,
    };
  }

  /**
   * Cập nhật API Key mới
   * @param {string} key
   */
  setApiKey(key) {
    this.apiKey = (key || '').trim();
  }

  /**
   * Cập nhật Base URL mới
   * @param {string} url
   */
  setBaseUrl(url) {
    this.baseUrl = (url || '').replace(/\/+$/, '');
  }

  /**
   * Header xác thực API Key
   * @private
   */
  _getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    return headers;
  }

  /**
   * Xử lý gọi API và trích xuất billing headers
   * @private
   */
  async _request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = { ...this._getHeaders(), ...(options.headers || {}) };

    let response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (networkErr) {
      throw new Error(`Không thể kết nối tới INHANH API tại ${this.baseUrl}. Vui lòng kiểm tra lại địa chỉ máy chủ và kết nối mạng.`);
    }

    // Đọc thông tin quota & billing từ HTTP headers
    const quotaCost = response.headers.get('X-Quota-Cost');
    const pointsBal = response.headers.get('X-Points-Balance');
    const rateRem = response.headers.get('X-RateLimit-Remaining');

    this.lastBillingInfo = {
      quotaCost: quotaCost !== null ? parseInt(quotaCost, 10) : 0,
      pointsBalance: pointsBal !== null ? parseFloat(pointsBal) : null,
      rateLimitRemaining: rateRem !== null ? parseInt(rateRem, 10) : null,
    };

    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: response.ok, rawText: text };
      }
    }

    if (!response.ok || (data && data.ok === false)) {
      const errObj = (data && data.error) ? data.error : {};
      const code = errObj.code || `HTTP_${response.status}`;
      const msg = errObj.message || (typeof errObj === 'string' ? errObj : `Lỗi ${response.status}: ${response.statusText}`);

      const error = new Error(`[${code}] ${msg}`);
      error.code = code;
      error.status = response.status;
      error.billing = this.lastBillingInfo;
      throw error;
    }

    return (data && data.data !== undefined) ? data.data : data;
  }

  /**
   * Lấy danh mục tất cả mẫu bao bì chuẩn ECMA & FEFCO (Miễn phí - 0 Quota)
   * @returns {Promise<Array>}
   */
  async getSpecs() {
    return this._request('/v1/engine/specs', { method: 'GET' });
  }

  /**
   * Lấy chi tiết thông số giới hạn và mặc định của 1 mẫu (Miễn phí - 0 Quota)
   * @param {string} modelId - Ví dụ: 'ECMA_A30', 'FEFCO_0427'
   * @returns {Promise<Object>}
   */
  async getSpec(modelId) {
    return this._request(`/v1/engine/specs/${encodeURIComponent(modelId)}`, { method: 'GET' });
  }

  /**
   * Xác thực kích thước hình học trước khi tính toán (Miễn phí - 0 Quota)
   * @param {string} modelId
   * @param {Object} dimensions - { L: 200, W: 140, H: 80, ... }
   * @returns {Promise<Object>}
   */
  async validate(modelId, dimensions) {
    return this._request('/v1/engine/validate', {
      method: 'POST',
      body: JSON.stringify({ model_id: modelId, dimensions }),
    });
  }

  /**
   * Biên dịch mô hình 2D Dieline vector và 3D kinematics scene (Tốn 1 Quota)
   * @param {Object} params
   * @param {string} params.modelId - Mã mẫu (ECMA_A30, FEFCO_0427, ...)
   * @param {Object} params.dimensions - Kích thước hộp { L, W, H, ... }
   * @param {Object} [params.overrides] - Tuỳ biến nắp, đáy, phụ kiện
   * @param {boolean} [params.iso=true] - Kèm chú thích kích thước kỹ thuật ISO 19593-1
   * @returns {Promise<Object>} Trả về { model_id, bounds, svg, iso_svg, scene: { tree } }
   */
  async compile({ modelId, dimensions, overrides = null, iso = true }) {
    const query = iso ? '?iso=1' : '';
    return this._request(`/v1/engine/compile${query}`, {
      method: 'POST',
      body: JSON.stringify({
        model_id: modelId,
        dimensions,
        overrides: overrides || undefined,
      }),
    });
  }

  /**
   * Giải bài toán bình trang N-up tối ưu trên khổ in (Tốn 1 Quota)
   * @param {Object} params
   * @param {number} params.dieWidthMm - Chiều rộng khuôn bế dieline (mm)
   * @param {number} params.dieHeightMm - Chiều cao khuôn bế dieline (mm)
   * @param {Array<Object>} params.sheets - Danh sách khổ in cần giải hoặc so sánh
   * @param {Object} [params.plan] - Cấu hình kế hoạch (target_quantity, mode, spoilage)
   * @param {string} [params.modelId] - Mã mẫu (tuỳ chọn, để nesting biên dạng thực tế)
   * @param {Object} [params.dimensions] - Kích thước mẫu (để nesting chính xác)
   * @returns {Promise<Array<Object>>} Danh sách phương án bình trang xếp hạng theo hiệu suất
   */
  async imposition({ dieWidthMm, dieHeightMm, sheets, plan = null, modelId = null, dimensions = null }) {
    const payload = {
      die_width_mm: dieWidthMm,
      die_height_mm: dieHeightMm,
      sheets: sheets.map(s => ({
        sheet_width_mm: s.sheet_width_mm,
        sheet_height_mm: s.sheet_height_mm,
        gutter_x_mm: s.gutter_x_mm ?? 5,
        gutter_y_mm: s.gutter_y_mm ?? 5,
        gripper_margin_mm: s.gripper_margin_mm ?? 10,
        margin_top_mm: s.margin_top_mm ?? 10,
        margin_right_mm: s.margin_right_mm ?? 10,
        margin_bottom_mm: s.margin_bottom_mm ?? 10,
        margin_left_mm: s.margin_left_mm ?? 10,
        allow_rotation: s.allow_rotation ?? true,
        target_quantity: s.target_quantity ?? (plan?.target_quantity || 1000),
      })),
    };

    if (plan) {
      payload.plan = {
        target_quantity: plan.target_quantity || 1000,
        mode: plan.mode || 'simplex',
        interlock: Boolean(plan.interlock),
        spoilage_percent: plan.spoilage_percent || 4,
      };
    }

    if (modelId) payload.model_id = modelId;
    if (dimensions) payload.dimensions = dimensions;

    return this._request('/v1/engine/imposition', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Tạo đường dẫn tải file CAD / SVG / PDF trực tiếp từ API
   * @param {Object} params
   * @param {string} params.modelId - Mã mẫu
   * @param {string} params.format - 'svg' | 'dxf' | 'cff2' | 'pdf'
   * @param {Object} params.dimensions - Kích thước { L, W, H, ... }
   * @param {boolean} [params.download=true] - Ép tải về (Content-Disposition: attachment)
   * @returns {string} URL tải file hoàn chỉnh
   */
  getDownloadUrl({ modelId, format = 'svg', dimensions = {}, download = true }) {
    const params = new URLSearchParams();
    params.set('model_id', modelId);
    params.set('content', format);
    if (download) params.set('download', '1');

    if (dimensions.L) params.set('length', String(dimensions.L));
    if (dimensions.W) params.set('width', String(dimensions.W));
    if (dimensions.H) params.set('height', String(dimensions.H));
    if (dimensions.T) params.set('thickness', String(dimensions.T));

    if (this.apiKey) {
      params.set('api_key', this.apiKey);
    }

    return `${this.baseUrl}/v1/engine/download?${params.toString()}`;
  }
}
