import test from 'node:test';
import assert from 'node:assert/strict';

const API = 'http://localhost:3000/api';

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function get(path, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function del(path, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: 'DELETE', headers });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test('Güvenlik ve Yetki Matrisi Testleri', async (t) => {
  let adminToken = '';
  let supervisorToken = '';
  let employeeToken = '';

  await t.test('1. Başlangıç kullanıcıları ile giriş', async () => {
    const adminRes = await post('/auth/login', { username: 'admin', password: 'admin123' });
    assert.equal(adminRes.status, 201);
    assert.equal(adminRes.data.user.role, 'admin');
    adminToken = adminRes.data.token;

    const supRes = await post('/auth/login', { username: 'kemal', password: 'kemal123' });
    assert.equal(supRes.status, 201);
    assert.equal(supRes.data.user.role, 'supervisor');
    supervisorToken = supRes.data.token;

    const empRes = await post('/auth/login', { username: 'ahmet', password: 'ahmet123' });
    assert.equal(empRes.status, 201);
    assert.equal(empRes.data.user.role, 'employee');
    employeeToken = empRes.data.token;
  });

  await t.test('2. P0-1: Açık kayıt yetki yükseltmeyi engellemeli (admin istenilse bile employee atanmalı)', async () => {
    const testUsername = 'hacker_' + Math.random().toString(36).substring(2, 7);
    const regRes = await post('/auth/register', {
      fullName: 'Hacker User',
      username: testUsername,
      password: 'password1234',
      role: 'admin', // Kötü niyetli rol talebi
    });

    assert.equal(regRes.status, 201);
    // Rolün kesinlikle employee olduğundan emin olunur
    assert.equal(regRes.data.user.role, 'employee');

    // Bu kullanıcının tokenı admin endpointlerine erişememeli
    const listRes = await get('/auth/users', regRes.data.token);
    assert.equal(listRes.status, 403);
  });

  await t.test('3. Şifre en az 8 karakter olmalı', async () => {
    const shortRes = await post('/auth/register', {
      fullName: 'Kısa Şifre',
      username: 'kisa_' + Math.random().toString(36).substring(2, 7),
      password: '123', // < 8 karakter
    });
    assert.equal(shortRes.status, 400);
  });

  await t.test('4. P0-2: Şef kullanıcısı kullanıcı yönetimini çağıramaz (403 Forbidden)', async () => {
    const listRes = await get('/auth/users', supervisorToken);
    assert.equal(listRes.status, 403);

    const createRes = await post(
      '/auth/users',
      { fullName: 'Test', username: 'testuser', password: 'password123', role: 'employee' },
      supervisorToken,
    );
    assert.equal(createRes.status, 403);
  });

  await t.test('5. P0-2: Personel kullanıcısı şef veya admin uç noktalarına erişemez (403 Forbidden)', async () => {
    const listRes = await get('/auth/users', employeeToken);
    assert.equal(listRes.status, 403);

    const reportsRes = await get('/reports/dashboard', employeeToken);
    assert.equal(reportsRes.status, 403);
  });

  await t.test('6. Admin kullanıcısı kullanıcıları listeleyebilir ve yeni kullanıcı ekleyebilir', async () => {
    const listRes = await get('/auth/users', adminToken);
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.data));

    const newUsername = 'staff_' + Math.random().toString(36).substring(2, 7);
    const createRes = await post(
      '/auth/users',
      {
        fullName: 'Yeni Deneme Personeli',
        username: newUsername,
        password: 'password1234',
        role: 'supervisor',
      },
      adminToken,
    );
    assert.equal(createRes.status, 201);
    assert.equal(createRes.data.role, 'supervisor');

    // Admin bu oluşturduğu kullanıcıyı silebilir
    const delRes = await del(`/auth/users/${createRes.data.id}`, adminToken);
    assert.equal(delRes.status, 200);
    assert.equal(delRes.data.success, true);
  });

  await t.test('7. Admin kendini veya sistemdeki son admini silemez', async () => {
    // Admin kendi kendini silmeye çalışırsa:
    const meRes = await get('/auth/me', adminToken);
    const selfDelRes = await del(`/auth/users/${meRes.data.id}`, adminToken);
    assert.equal(selfDelRes.status, 400);
  });
});
