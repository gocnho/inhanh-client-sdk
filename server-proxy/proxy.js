/**
 * INHANH API - Node.js Backend Proxy (Express.js)
 * 
 * Dùng file này trên server backend của bạn để GIẤU API KEY (ink_live_...) 
 * không cho người dùng cuối F12 nhìn thấy trên trình duyệt.
 * 
 * Cách chạy:
 *   npm install express cors dotenv
 *   node proxy.js
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// CẤU HÌNH BẢO MẬT PHÍA BACKEND
const INHANH_API_URL = process.env.INHANH_API_URL || 'https://inhanh.com';
const INHANH_API_KEY = process.env.INHANH_API_KEY || 'ink_live_5u6kug93r8e7kitzwdkol9grfslx32fk';

app.use(cors());
app.use(express.json());

// Proxy chuyển tiếp endpoint specs (miễn phí)
app.get('/api/specs', async (req, res) => {
  try {
    const upstream = await fetch(`${INHANH_API_URL}/v1/engine/specs`, {
      headers: { 'X-API-Key': INHANH_API_KEY }
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Proxy chuyển tiếp endpoint compile (2D + 3D)
app.post('/api/compile', async (req, res) => {
  try {
    const upstream = await fetch(`${INHANH_API_URL}/v1/engine/compile?iso=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': INHANH_API_KEY
      },
      body: JSON.stringify(req.body)
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Proxy chuyển tiếp endpoint imposition (Bình trang)
app.post('/api/imposition', async (req, res) => {
  try {
    const upstream = await fetch(`${INHANH_API_URL}/v1/engine/imposition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': INHANH_API_KEY
      },
      body: JSON.stringify(req.body)
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend Proxy đang chạy tại http://localhost:${PORT}`);
  console.log(`Chuyển tiếp yêu cầu tới INHANH API: ${INHANH_API_URL}`);
});
