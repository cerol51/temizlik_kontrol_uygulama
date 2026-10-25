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

  await t.test('4. P0-2: Şef kullanıcısı kullanıcı yönetimini çağıramaz (403 Forbidden), ancak saha personel listesini (/auth/users/staff) görebilir', async () => {
    const listRes = await get('/auth/users', supervisorToken);
    assert.equal(listRes.status, 403);

    const staffListRes = await get('/auth/users/staff', supervisorToken);
    assert.equal(staffListRes.status, 200);
    assert.ok(Array.isArray(staffListRes.data));
    assert.ok(staffListRes.data.every((u) => u.role === 'employee'));

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

  await t.test('8. P1-1: Fiziki Varlık Doğrulaması (Proof-of-Presence) - Token maskeleme ve doğrulama', async () => {
    // Personel /locations çağırdığında token maskelenmiş (null) olmalı
    const empLocsRes = await get('/locations', employeeToken);
    assert.equal(empLocsRes.status, 200);
    assert.ok(empLocsRes.data.length > 0);
    const loc = empLocsRes.data[0];
    assert.equal(loc.token, null, 'Personel genel listeden gizli tokenı okuyamamalı');

    // Personel admin QR token uç noktasına erişememeli (403 Forbidden)
    const empQrRes = await get(`/locations/${loc.id}/qr-token`, employeeToken);
    assert.equal(empQrRes.status, 403);

    // Admin QR tokenı yetkili olarak alabilmeli
    const adminQrRes = await get(`/locations/${loc.id}/qr-token`, adminToken);
    assert.equal(adminQrRes.status, 200);
    const realQrToken = adminQrRes.data.token;
    assert.ok(realQrToken, 'Admin gerçek tokenı okuyabilmeli');

    // Sahte/kötü niyetli QR tokenı ile temizlik beyanı denenirse 400 Bad Request
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

    // Gerçek, sahada okutulan QR tokenı ile temizlik beyanı -> isVerifiedQr = true
    const validTokenRes = await post(
      `/locations/${loc.id}/cleanings`,
      {
        tasksConfirmed: true,
        note: 'Saha temizliği tamamlandı',
        locationToken: realQrToken,
      },
      employeeToken,
    );
    assert.equal(validTokenRes.status, 201);
    assert.ok(validTokenRes.data.record);
    assert.equal(validTokenRes.data.record.isVerifiedQr, true, 'QR ile yapılan temizlik doğrulanmış olmalı');

    // QR okutulmadan yapılan uzaktan/manuel temizlik beyanı -> isVerifiedQr = false
    const manualCleanRes = await post(
      `/locations/${loc.id}/cleanings`,
      {
        tasksConfirmed: true,
        note: 'Manuel uzaktan beyan',
      },
      employeeToken,
    );
    assert.equal(manualCleanRes.status, 201);
    assert.equal(manualCleanRes.data.record.isVerifiedQr, false, 'Manuel temizlik unverified olarak işaretlenmeli');
  });

  await t.test('9. P1-5: Ziyaretçi Anket Anti-Spam Koruması (3 dakika mükerrer oy engeli)', async () => {
    const locsRes = await get('/locations');
    const loc = locsRes.data[0];
    const testHash = 'test_device_' + Math.random().toString(36).substring(2, 9);

    // İlk anket gönderimi başarılı olmalı
    const survey1 = await post('/surveys', {
      locationId: loc.id,
      rating: 'good',
      clientHash: testHash,
    });
    assert.equal(survey1.status, 201);
    assert.equal(survey1.data.success, true);

    // Aynı cihaz / IP'den 3 dakika içinde 2. oy kullanımı engellenmeli
    const survey2 = await post('/surveys', {
      locationId: loc.id,
      rating: 'bad',
      issues: ['Koku'],
      clientHash: testHash,
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

  await t.test('13. P2-1: HttpOnly Güvenli Cookie Doğrulaması, Access & Refresh Token Rotasyonu ve Query Token Sızıntı Koruması', async () => {
    // 1. Giriş yaparken accessToken, refreshToken ve Set-Cookie başlıkları dönmeli
    const loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    assert.equal(loginRes.status, 201);
    const loginData = await loginRes.json();
    assert.ok(loginData.accessToken, 'accessToken dönmeli');
    assert.ok(loginData.refreshToken, 'refreshToken dönmeli');
    assert.equal(loginData.expiresIn, 900, 'Access token süresi 15 dakika (900s) olmalı');

    const setCookies = loginRes.headers.get('set-cookie');
    assert.ok(setCookies, 'Set-Cookie başlığı dönmeli');
    assert.match(setCookies, /wc_token=/);
    assert.match(setCookies, /wc_refresh_token=/);
    assert.match(setCookies, /HttpOnly/i);

    // 2. Cookie ile Authorization header olmadan /auth/me çağrılabilmeli
    const tokenCookie = setCookies.split(',').find((c) => c.includes('wc_token=')).split(';')[0].trim();
    const meRes = await fetch(`${API}/auth/me`, {
      headers: { Cookie: tokenCookie },
    });
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.username, 'admin');

    // 3. GÜVENLİK KURALI: Refresh token doğrudan API uç noktalarında yetkilendirme olarak KULLANILAMAZ!
    const directRefreshRes = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${loginData.refreshToken}` },
    });
    assert.equal(directRefreshRes.status, 401, 'Refresh token ile API isteği 401 Unauthorized dönmeli');

    // 4. GÜVENLİK KURALI (P1): Query string token kabulü standart REST API uç noktalarında ENGELLENMELİ (log ve history sızıntısı önleme)
    const queryTokenRes = await fetch(`${API}/auth/me?token=${loginData.accessToken}`);
    assert.equal(queryTokenRes.status, 401, 'Query string ile API isteği 401 Unauthorized dönmeli');

    // 5. /auth/refresh ile refreshToken verilerek yeni token çifti alınabilmeli (Token Rotation)
    const refreshRes = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginData.refreshToken }),
    });
    assert.equal(refreshRes.status, 201);
    const refreshData = await refreshRes.json();
    assert.ok(refreshData.accessToken, 'Yeni accessToken üretilmeli');
    assert.ok(refreshData.refreshToken, 'Yeni rotated refreshToken üretilmeli');
    assert.notEqual(refreshData.accessToken, loginData.accessToken, 'Yeni access token üretilmeli');

    // 6. /auth/logout ile her iki cookie de temizlenmeli
    const logoutRes = await fetch(`${API}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: tokenCookie },
    });
    assert.equal(logoutRes.status, 201);
    const logoutCookies = logoutRes.headers.get('set-cookie');
    assert.ok(logoutCookies);
    assert.match(logoutCookies, /wc_token=;/);
    assert.match(logoutCookies, /wc_refresh_token=;/);
  });

  await t.test('14. P3-1: Medya ve Fotoğraf Depolama Servisi (MIME doğrulama, Base64 diske kaydetme ve statik akış)', async () => {
    // 1. Geçerli bir base64 JPEG fotoğrafı yükleme
    const sampleJpeg = 'data:image/jpeg;base64,' + Buffer.from('test-image-binary-stream').toString('base64');
    const uploadRes = await fetch(`${API}/media/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: sampleJpeg }),
    });
    assert.equal(uploadRes.status, 201);
    const uploadData = await uploadRes.json();
    assert.ok(uploadData.url, 'Medya erişim URLsi dönmeli');
    assert.match(uploadData.url, /^\/api\/media\/[a-f0-9-]+\.jpg$/);

    // 2. Yüklenen fotoğrafı GET ile okuma
    const getRes = await fetch(`http://localhost:3000${uploadData.url}`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.headers.get('content-type'), 'image/jpeg');
    assert.ok(getRes.headers.get('cache-control')?.includes('immutable'));
    const bodyText = await getRes.text();
    assert.equal(bodyText, 'test-image-binary-stream');

    // 3. Desteklenmeyen dosya türü (PDF / HTML) engellenmeli
    const invalidFormat = 'data:application/pdf;base64,' + Buffer.from('fake-pdf').toString('base64');
    const invalidRes = await fetch(`${API}/media/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: invalidFormat }),
    });
    assert.equal(invalidRes.status, 400);

    // 4. Personel müdahale çözümünde base64 fotoğraf verildiğinde otomatik /api/media/... formatına dönüştürülmeli
    const locsRes = await get('/locations');
    const loc = locsRes.data[0];

    // Olay oluştur
    const randTag = Math.random().toString(36).substring(2, 10);
    const surveyRes = await post('/surveys', {
      locationId: loc.id,
      rating: 'bad',
      issues: ['Musluk arızalı'],
      clientHash: `${randTag}_media`,
    });
    assert.equal(surveyRes.status, 201);

    const incidentsRes = await get(`/incidents?locationId=${loc.id}`, employeeToken);
    const incident = incidentsRes.data[0];
    assert.ok(incident);

    // Personel base64 fotoğraf ile olayı çözer
    const resolveRes = await post(
      `/incidents/${incident.id}/staff-resolve`,
      {
        note: 'Musluk tamir edildi, fotoğraf eklendi.',
        photoUrl: sampleJpeg,
        staffName: 'Ahmet Personel',
      },
      employeeToken,
    );
    assert.equal(resolveRes.status, 201);
    assert.ok(resolveRes.data.photoUrl);
    assert.match(resolveRes.data.photoUrl, /^\/api\/media\/[a-f0-9-]+\.jpg$/, 'Veritabanında base64 yerine hafif medya URLsi saklanmalı');
  });

  await t.test('15. P0-1: Soft-Delete Koruması (Mahal ve Kullanıcı Arşivleme, Geçmiş Kayıtların Korunması)', async () => {
    // 1. Yeni bir test mahali oluştur
    const randCode = 'SOFT_' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const createLocRes = await post(
      '/locations',
      {
        code: randCode,
        name: `Test Mahal ${randCode}`,
        toleranceMinutes: 15,
        schedule: ['08:00', '12:00'],
      },
      adminToken,
    );
    assert.equal(createLocRes.status, 201);
    const locId = createLocRes.data.id;

    // 2. Bu mahale bir temizlik kaydı ekle
    const cleanRes = await post(
      `/locations/${locId}/cleanings`,
      {
        tasksConfirmed: true,
        staffName: 'Ali Temizlikçi',
        note: 'Soft delete testi öncesi kayıt',
      },
      employeeToken,
    );
    assert.equal(cleanRes.status, 201);

    // 3. Mahali sil (DELETE /locations/:id)
    const delRes = await del(`/locations/${locId}`, adminToken);
    assert.equal(delRes.status, 200);
    assert.match(delRes.data.message, /arşivlendi/i);

    // 4. Mahal aktif mahal listesinde (/locations) GÖRÜNMEMELİ (TypeORM Soft-Delete)
    const activeLocs = await get('/locations', supervisorToken);
    const found = activeLocs.data.find((l) => l.id === locId);
    assert.equal(found, undefined, 'Soft-delete edilen mahal aktif listede gelmemeli');

    // 5. Yeni bir kullanıcı aç ve sil (DELETE /auth/users/:id)
    const testUsername = `user_${Math.random().toString(36).substring(2, 7)}`;
    const createUserRes = await post(
      '/auth/users',
      {
        username: testUsername,
        password: 'password123',
        fullName: 'Geçici Kullanıcı',
        role: 'employee',
      },
      adminToken,
    );
    assert.equal(createUserRes.status, 201);
    const userId = createUserRes.data.id;

    const delUserRes = await del(`/auth/users/${userId}`, adminToken);
    assert.equal(delUserRes.status, 200);
    assert.equal(delUserRes.data.success, true);

    const activeUsers = await get('/auth/users', adminToken);
    const foundUser = activeUsers.data.find((u) => u.id === userId);
    assert.equal(foundUser, undefined, 'Soft-delete edilen kullanıcı aktif listede gelmemeli');
  });

  await t.test('16. P0-2: Çok Kademeli (Multi-tier) SLA Eskalasyon Motoru Kontrolü', async () => {
    // Eskalasyon kontrol fonksiyonunun tetiklenmesi ve başarılı sonuç dönmesi
    const triggerRes = await post('/incidents/auto-escalate', {}, supervisorToken);
    assert.equal(triggerRes.status, 201);
    assert.equal(triggerRes.data.success, true);
    assert.equal(typeof triggerRes.data.escalatedCount, 'number');

    // Yetkisiz personelin eskalasyon motorunu tetikleyememesi (403 Forbidden)
    const unauthorizedTrigger = await post('/incidents/auto-escalate', {}, employeeToken);
    assert.equal(unauthorizedTrigger.status, 403);
  });

  await t.test('17. P1-1: Idempotency Key ile Mükerrer Temizlik / Ağ Tekrarı Engelleme', async () => {
    const locsRes = await get('/locations');
    const loc = locsRes.data[0];
    const idempotencyKey = `idem_${Math.random().toString(36).substring(2, 12)}`;

    // 1. İlk gönderim
    const firstCall = await post(
      `/locations/${loc.id}/cleanings`,
      {
        tasksConfirmed: true,
        staffName: 'Kemal Usta',
        idempotencyKey,
        note: 'İlk işlem denemesi',
      },
      employeeToken,
    );
    assert.equal(firstCall.status, 201);
    assert.equal(firstCall.data.duplicatePrevented, undefined);
    assert.ok(firstCall.data.record.id);

    // 2. Ağ gecikmesi veya çift tıklama ile gelen birebir aynı idempotencyKey çağrısı
    const retryCall = await post(
      `/locations/${loc.id}/cleanings`,
      {
        tasksConfirmed: true,
        staffName: 'Kemal Usta',
        idempotencyKey,
        note: 'Mükerrer ağ isteği',
      },
      employeeToken,
    );
    assert.equal(retryCall.status, 201);
    assert.equal(retryCall.data.duplicatePrevented, true);
    assert.equal(retryCall.data.record.id, firstCall.data.record.id, 'Aynı kayıt döndürülmeli, yeni kayıt açılmamalı');
  });

  await t.test('18. P2-2: Çok Türlü CSV Rapor Dışa Aktarımı (Temizlik, Arıza/Şikayet, Denetim İzi)', async () => {
    // 1. Standart denetim izi CSV dışa aktarımı
    const resAudit = await fetch(`${API}/reports/export-csv?type=audit`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(resAudit.status, 200);
    assert.match(resAudit.headers.get('content-type'), /text\/csv/);
    const auditText = await resAudit.text();
    assert.match(auditText, /Zaman,Mahal,Eylem,Kullanici,Ozet/);

    // 2. Temizlik kayıtları CSV dışa aktarımı
    const resCleanings = await fetch(`${API}/reports/export-csv?type=cleanings`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(resCleanings.status, 200);
    const cleaningsText = await resCleanings.text();
    assert.match(cleaningsText, /Kayıt ID,Mahal Kodu,Mahal Adı,Personel/);

    // 3. Arıza / Şikayet biletleri CSV dışa aktarımı
    const resIncidents = await fetch(`${API}/reports/export-csv?type=incidents`, {
      headers: { Authorization: `Bearer ${supervisorToken}` },
    });
    assert.equal(resIncidents.status, 200);
    const incidentsText = await resIncidents.text();
    assert.match(incidentsText, /Bilet No,Mahal,Durum,Sorunlar/);

    // 4. Yetkisiz personel erişimi engellenmeli (403 Forbidden)
    const resForbidden = await fetch(`${API}/reports/export-csv`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    assert.equal(resForbidden.status, 403);
  });
});



