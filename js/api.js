function buildQuery(params) {
  const usp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') usp.append(k, v);
  });
  return usp.toString();
}

function apiGet(params) {
  if (!API_URL || API_URL.includes('PASTE_YOUR')) {
    return Promise.reject(new Error('ยังไม่ได้ตั้งค่า API_URL ใน js/config.js'));
  }
  const url = `${API_URL}?${buildQuery(params)}`;
  return fetch(url).then(r => r.json()).then(data => {
    if (!data.ok) throw new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    return data;
  });
}

function apiPost(payload) {
  if (!API_URL || API_URL.includes('PASTE_YOUR')) {
    return Promise.reject(new Error('ยังไม่ได้ตั้งค่า API_URL ใน js/config.js'));
  }
  return fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload || {})
  }).then(r => r.json()).then(data => {
    if (!data.ok) throw new Error(data.error || 'บันทึกข้อมูลไม่สำเร็จ');
    return data;
  });
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, mimeType: file.type || 'application/octet-stream', base64: reader.result });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
