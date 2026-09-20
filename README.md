# Hướng Dẫn Tích Hợp INHANH API Cho Client (HTML, JS, CSS)

[![GitHub Repository](https://img.shields.io/badge/GitHub-inhanh--client--sdk-blue?logo=github)](https://github.com/gocnho/inhanh-client-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

> **Kho lưu trữ mẫu (Example Repository):**  
> 🔗 [https://github.com/gocnho/inhanh-client-sdk](https://github.com/gocnho/inhanh-client-sdk)

Bộ mã nguồn mẫu **INHANH API Client Kit** cung cấp trọn gói giải pháp cho đối tác, nhà in, sàn thương mại điện tử hoặc ứng dụng web của khách hàng có thể gọi trực tiếp **INHANH API** thông qua **API Key (`ink_live_...`)** để hiển thị:
1. **Bản vẽ 2D (Dieline Vector)**: Render SVG sắc nét, hỗ trợ phóng to/thu nhỏ, di chuyển (Pan/Zoom), thước đo kích thước kỹ thuật ISO 19593-1 và bật/tắt các lớp nét bế (`cut`), nét cấn (`crease`), bù xén (`bleed`), thước đo (`dimensions`).
2. **Mô hình 3D (Packaging Kinematics)**: Dựng hình 3D chuẩn công nghiệp bằng Three.js (WebGL), tự động tạo bản lề gập mở theo chuyển động thực tế (Kinematics Tree) với thanh trượt gập $0\% \to 100\%$, xoay 360°, đổi màu giấy.
3. **Sơ đồ Bình Trang (Imposition N-up)**: Xếp phôi tự động trên khổ in máy, hiển thị dải nhíp in (gripper), lề an toàn, lồng trực tiếp khuôn bế vào phôi và tính toán kinh tế (số con/tờ, % hiệu dụng giấy, số ram giấy).

---

## 1. Khởi Động Nhanh (Quickstart)

```bash
# Clone kho lưu trữ ví dụ
git clone https://github.com/gocnho/inhanh-client-sdk.git
cd inhanh-client-sdk
```

### Cách 1: Click đúp chạy ngay `start.bat` (Khuyến nghị trên Windows)
- Chỉ cần click đúp vào file [`start.bat`](start.bat), máy chủ web cục bộ sẽ tự khởi động và tự động mở trình duyệt tại `http://localhost:8080`.

### Cách 2: Mở trực tiếp `index.html` (Không cần web server)
- Bạn có thể click đúp mở trực tiếp file [`index.html`](index.html) bằng bất kỳ trình duyệt nào (Chrome, Edge, Firefox).
- File đã được tích hợp sẵn `bundle.js` tự thân nên **không bị lỗi CORS `file:///`**.

### Cách 3: Chạy qua Node.js hoặc Python
```bash
# Chạy dev server kèm CORS Proxy tích hợp:
npm start
# Hoặc: node server.js
# Hoặc: python -m http.server 8080
```
Sau đó truy cập `http://localhost:8080` trên trình duyệt.  
Hệ thống tự động kết nối API, tự động biên dịch và tính toán khi bạn thay đổi thông số.

---

## 2. Cấu Trúc Thư Mục

```
examples/client-sdk/
├── index.html                  # Giao diện chính tích hợp đầy đủ 3 View & Quản lý API Key
├── style.css                   # Thiết kế hiện đại Dark Mode, Studio Layout, Glassmorphism
├── js/
│   ├── inhanh-api.js           # Client SDK module giao tiếp RESTful với INHANH API
│   ├── viewer-2d.js            # Module điều khiển bản vẽ 2D Dieline (SVG, Pan/Zoom, Layers)
│   ├── viewer-3d.js            # Module mô phỏng 3D Fold (Three.js WebGL, Kinematics)
│   ├── viewer-imposition.js    # Module sơ đồ bình trang (Press-sheet SVG, Gripper, N-up)
│   └── app.js                  # Ứng dụng điều phối kết nối UI và các Viewers
└── server-proxy/               # Giải pháp bảo vệ API Key phía Backend
    ├── proxy.js                # Proxy Node.js (Express)
    └── proxy.php               # Proxy PHP (WordPress / Apache)
```

---

## 3. Hướng Dẫn Tích Hợp Vào Dự Án Của Bạn

### 3.1 Nhúng thư viện SDK (`inhanh-api.js`)

```javascript
import { InhanhClient } from './js/inhanh-api.js';

// Khởi tạo client với API Key
const client = new InhanhClient({
  baseUrl: 'https://inhanh.com',
  apiKey: 'ink_live_5u6kug93r8e7kitzwdkol9grfslx32fk'
});

// 1. Lấy danh mục mẫu bao bì (Miễn phí - 0 Quota)
const specs = await client.getSpecs();
console.log('Danh mục mẫu:', specs);

// 2. Biên dịch mẫu hộp thành 2D SVG và 3D Scene (1 Quota)
const result = await client.compile({
  modelId: 'ECMA_A30',
  dimensions: { L: 200, W: 140, H: 80, T: 0.4 },
  iso: true
});

// 3. Tính toán phương án bình trang N-up tối ưu (1 Quota)
const dieWidth = Math.round(result.bounds.max_x - result.bounds.min_x);
const dieHeight = Math.round(result.bounds.max_y - result.bounds.min_y);

const plans = await client.imposition({
  dieWidthMm: dieWidth,
  dieHeightMm: dieHeight,
  sheets: [{
    sheet_width_mm: 650,
    sheet_height_mm: 860,
    gutter_x_mm: 5,
    gutter_y_mm: 5,
    gripper_margin_mm: 10
  }],
  plan: { target_quantity: 1000, mode: 'simplex' }
});

console.log('Phương án bình trang tối ưu:', plans[0]);
```

---

### 3.2 Nhúng Trình Hiển Thị 2D (`viewer-2d.js`)

```html
<div id="dieline-container" style="width: 100%; height: 500px; position: relative;"></div>

<script type="module">
  import { Viewer2D } from './js/viewer-2d.js';
  
  const container = document.getElementById('dieline-container');
  const viewer2d = new Viewer2D(container);

  // Render SVG từ kết quả compile
  viewer2d.render(result.iso_svg || result.svg, result.bounds);

  // Các điều khiển tiện ích:
  // viewer2d.zoomIn();
  // viewer2d.zoomOut();
  // viewer2d.fitView();
  // viewer2d.toggleLayer('cut', true);
  // viewer2d.toggleLayer('crease', false);
  // viewer2d.downloadSvg('my-box.svg');
</script>
```

---

### 3.3 Nhúng Trình Mô Phỏng 3D (`viewer-3d.js`)

Khai báo import map Three.js trong thẻ `<head>`:
```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
    }
  }
</script>
```

Khởi tạo canvas 3D:
```html
<div id="packaging-3d-container" style="width: 100%; height: 500px; position: relative;"></div>

<script type="module">
  import { Viewer3D } from './js/viewer-3d.js';

  const container = document.getElementById('packaging-3d-container');
  const viewer3d = new Viewer3D(container, { paperHex: '#f4ede4' });

  // Nạp cấu trúc cây động học từ kết quả compile
  viewer3d.render(result.scene.tree);

  // Kéo thanh trượt gập mở (0.0 = phẳng, 1.0 = gập kín)
  // viewer3d.applyFold(0.75);

  // Tùy biến khác:
  // viewer3d.setPaperColor('#ffffff');
  // viewer3d.toggleAutoRotate();
  // viewer3d.resetCamera();
  // viewer3d.screenshot('box-3d.png');
</script>
```

---

### 3.4 Nhúng Sơ Đồ Bình Trang (`viewer-imposition.js`)

```html
<div id="imposition-container" style="width: 100%; height: 500px; position: relative;"></div>

<script type="module">
  import { ViewerImposition } from './js/viewer-imposition.js';

  const container = document.getElementById('imposition-container');
  const viewerImp = new ViewerImposition(container);

  // Render phương án bình trang tốt nhất
  viewerImp.render(plans[0], result.svg, result.bounds);

  // Điều khiển:
  // viewerImp.fitView();
  // viewerImp.toggleLayer('gripper', true);
  // viewerImp.toggleLayer('cells', true);
</script>
```

---

## 4. Bảo Mật API Key Trên Môi Trường Production

> [!WARNING]
> Nếu bạn xây dựng website công khai (public ecommerce, trang đặt in mở cho khách hàng vào xem), **tuyệt đối không để lộ `ink_live_...` trực tiếp trong mã nguồn JavaScript phía trình duyệt**.

Để bảo mật, hãy sử dụng mô hình **Backend Proxy (BFF)**:
1. Tạo một route trên server của bạn (Node.js Express hoặc PHP):
   - Client JS gọi tới `https://your-domain.com/api/compile`
   - Server của bạn nhận request, gắn header `X-API-Key: ink_live_...` và chuyển tiếp sang `INHANH API`.
   - Xem code mẫu hoàn chỉnh tại:
     - [server-proxy/proxy.js](server-proxy/proxy.js) (Node.js Express)
     - [server-proxy/proxy.php](server-proxy/proxy.php) (PHP / WordPress)
2. Trên frontend client, chỉ cần cấu hình `baseUrl` trỏ về server proxy của bạn:
   ```javascript
   const client = new InhanhClient({ baseUrl: 'https://your-domain.com/api' });
   ```
