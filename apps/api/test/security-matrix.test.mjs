import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = 'http://localhost:3000/api';

let serverProcess = null;

async function ensureServerRunning() {
  try {
    const res = await fetch(`${API}/health`);
    if (res.ok) return;
  } catch {}

  serverProcess = spawn('node', ['dist/main.js'], {
    cwd: resolve(__dirname, '..'),
    stdio: 'ignore',
    env: { ...process.env, ALLOW_IN_MEMORY_DB: 'true' },
  });

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const res = await fetch(`${API}/health`);
      if (res.ok) return;
    } catch {}
  }
}

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
  await ensureServerRunning();

  t.after(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  });

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

  await t.test('8. P1-1: Fiziki Varlık Doğrulaması (Proof-of-Presence) - Geçersiz token engellenmeli', async () => {
    const locsRes = await get('/locations', employeeToken);
    assert.equal(locsRes.status, 200);
    assert.ok(locsRes.data.length > 0);
    const loc = locsRes.data[0];

    // Sahte/kötü niyetli QR tokenı ile temizlik beyanı denenirse:
    const invalidTokenRes = await post(
      `/locations/${loc.id}/cleanings`,
      {
        tasksConfirmed: true,
        note: 'Uzaktan hileli beyan denemesi',
        locationToken: 'fake-stolen-token-12345',
      },
      employeeToken,
    );
    assert.equal(invalidTokenRes.status, 400);
    assert.match(invalidTokenRes.data.message, /Fiziki varlık doğrulaması başarısız/);

    // Gerçek, sahada okutulan QR tokenı ile temizlik beyanı:
    const validTokenRes = await post(
      `/locations/${loc.id}/cleanings`,
      {
        tasksConfirmed: true,
        note: 'Saha temizliği tamamlandı',
        locationToken: loc.token,
      },
      employeeToken,
    );
    assert.equal(validTokenRes.status, 201);
    assert.ok(validTokenRes.data.record);
    assert.ok(validTokenRes.data.sla);
  });

  await t.test('9. P1-5: Ziyaretçi Anket Anti-Spam Koruması (3 dakika mükerrer oy engeli)', async () => {
    const locsRes = await get('/locations');
    const loc = locsRes.data[0];

    // İlk anket gönderimi başarılı olmalı
    const survey1 = await post('/surveys', {
      locationId: loc.id,
      rating: 'good',
    });
    assert.equal(survey1.status, 201);
    assert.equal(survey1.data.success, true);

    // Aynı cihaz / IP'den 3 dakika içinde 2. oy kullanımı engellenmeli
    const survey2 = await post('/surveys', {
      locationId: loc.id,
      rating: 'bad',
      issues: ['Koku'],
    });
    assert.equal(survey2.status, 400);
    assert.match(survey2.data.message, /kısa süre önce oy kullandınız/);
  });

  await t.test('10. P1-4: Çakışmasız Benzersiz Bilet Numaratörü (INC-YYYYMMDD-HHMMSS-XXXX)', async () => {
    const locsRes = await get('/locations', supervisorToken);
    const loc = locsRes.data[0];

    // Şef uygunsuzluk denetimi gönderir (isApproved: false)
    const auditRes = await post(
      `/locations/${loc.id}/audits`,
      {
        isApproved: false,
        checklist: { 'Zemin Temizliği': false },
        note: 'Zemin ıslak ve sabun eksik',
      },
      supervisorToken,
    );
    assert.equal(auditRes.status, 201);
    assert.ok(auditRes.data.correctiveIncident);

    const ticketId = auditRes.data.correctiveIncident.id;
    // Format doğrulaması: INC-YYYYMMDD-HHMMSS-XXXX
    assert.match(ticketId, /^INC-\d{8}-\d{6}-\d{4}$/);
  });

  await t.test('11. P1-3: SLA Tolerans İçi Doğruluk Değerlendirmesi', async () => {
    const { evaluateSLA } = await import('../dist/restrooms.controller.js');
    const schedule = ['10:00', '12:00', '14:00'];

    // 1. Tolerans içi (+5 dk) zamanında sayılmalı (SLA compliant)
    const onTimeResult = evaluateSLA(schedule, '10:05', 15);
    assert.equal(onTimeResult.status, 'ON_TIME');
    assert.equal(onTimeResult.badgeClass, 'badge-ontime');

    // 2. Toleransı aşan (+25 dk) gecikmeli sayılmalı
    const lateResult = evaluateSLA(schedule, '10:25', 15);
    assert.equal(lateResult.status, 'LATE');
    assert.equal(lateResult.badgeClass, 'badge-notdone');

    // 3. Toleransı aşan erken (-30 dk) erken plan dışı sayılmalı
    const earlyResult = evaluateSLA(schedule, '09:30', 15);
    assert.equal(earlyResult.status, 'EARLY');
    assert.equal(earlyResult.badgeClass, 'badge-outoftime');
  });

  await t.test('12. P1-3: Yapılmayan Temizliklerin (MISSED) Otomatik Tespiti ve Zaman Çizelgesi Eşleştirmesi', async () => {
    const { evaluateDailySchedule } = await import('../dist/restrooms.controller.js');
    const schedule = ['08:00', '10:00', '12:00', '14:00'];
    const dummyCleanings = [
      {
        plannedSlot: '08:00',
        actualTime: '08:05',
        staffName: 'Ahmet Yılmaz',
      },
    ];

    // Simülasyon saati: 11:30 (10:00 slotu toleransı (+15 dk -> 10:15) aşmıştır, 12:00 ve 14:00 ise henüz gelmemiştir)
    const result = evaluateDailySchedule(schedule, dummyCleanings, 15, '11:30');

    assert.equal(result.slots.length, 4);

    // 08:00 slotu temizlendi -> ON_TIME
    assert.equal(result.slots[0].slot, '08:00');
    assert.equal(result.slots[0].status, 'ON_TIME');
    assert.equal(result.slots[0].staffName, 'Ahmet Yılmaz');

    // 10:00 slotu yapılmadı ve tolerans aşıldı -> MISSED
    assert.equal(result.slots[1].slot, '10:00');
    assert.equal(result.slots[1].status, 'MISSED');
    assert.equal(result.slots[1].badgeClass, 'badge-notdone');

    // 12:00 slotu henüz gelmedi -> WAITING
    assert.equal(result.slots[2].slot, '12:00');
    assert.equal(result.slots[2].status, 'WAITING');

    // Sayım doğrulamaları
    assert.equal(result.missedCount, 1, 'Kaçırılan slot sayısı 1 olmalı');
    assert.equal(result.onTimeCount, 1, 'Zamanında slot sayısı 1 olmalı');
    assert.equal(result.pendingCount, 2, 'Bekleyen slot sayısı 2 olmalı');
  });
});

