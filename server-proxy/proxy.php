<?php
/**
 * INHANH API - PHP Backend Proxy (WordPress / Apache / Nginx)
 * 
 * Dùng file này trên server PHP của bạn để GIẤU API KEY (ink_live_...) 
 * không cho người dùng cuối F12 nhìn thấy trên trình duyệt.
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// CẤU HÌNH BẢO MẬT PHÍA SERVER PHP
$INHANH_API_URL = getenv('INHANH_API_URL') ?: 'https://inhanh.com';
$INHANH_API_KEY = getenv('INHANH_API_KEY') ?: 'ink_live_5u6kug93r8e7kitzwdkol9grfslx32fk';

$action = isset($_GET['action']) ? $_GET['action'] : 'specs';
$targetUrl = '';
$method = 'GET';
$postData = null;

switch ($action) {
    case 'specs':
        $targetUrl = $INHANH_API_URL . '/v1/engine/specs';
        $method = 'GET';
        break;
    case 'compile':
        $targetUrl = $INHANH_API_URL . '/v1/engine/compile?iso=1';
        $method = 'POST';
        $postData = file_get_contents('php://input');
        break;
    case 'imposition':
        $targetUrl = $INHANH_API_URL . '/v1/engine/imposition';
        $method = 'POST';
        $postData = file_get_contents('php://input');
        break;
    default:
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Action không hợp lệ']);
        exit();
}

$ch = curl_init($targetUrl);
$headers = [
    'X-API-Key: ' . $INHANH_API_KEY,
    'Content-Type: application/json',
    'Accept: application/json'
];

curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

if ($method === 'POST' && $postData) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
}

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

http_response_code($httpCode ?: 200);
echo $response;
?>
