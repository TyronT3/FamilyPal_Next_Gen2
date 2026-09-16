import assert from 'node:assert/strict';

const productionUrl = 'https://dcevozgqpemuivhakgro.supabase.co';
const baseUrl = String(process.env.FAMILYPAL_SMOKE_URL || '').replace(/\/$/, '');
const anonKey = process.env.FAMILYPAL_SMOKE_ANON_KEY || '';
const email = process.env.FAMILYPAL_SMOKE_EMAIL || '';
const password = process.env.FAMILYPAL_SMOKE_PASSWORD || '';
const confirmation = process.env.FAMILYPAL_SMOKE_CONFIRM || '';

assert.equal(confirmation, 'separate-test-project', 'Set FAMILYPAL_SMOKE_CONFIRM=separate-test-project after checking the target.');
assert.ok(/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(baseUrl), 'Set FAMILYPAL_SMOKE_URL to a Supabase project URL.');
assert.notEqual(baseUrl, productionUrl, 'Refusing to run authenticated smoke writes against the production FamilyPal project.');
assert.ok(anonKey && email && password, 'Set the test-project anon key, email, and password environment variables.');

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${response.status} ${typeof body === 'string' ? body : body?.message || body?.msg || 'Request failed'}`);
  return body;
}

const auth = await jsonRequest(`${baseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
assert.ok(auth?.access_token, 'Test account did not return an access token.');

const headers = { apikey: anonKey, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' };
const marker = `familypal-smoke-${crypto.randomUUID()}`;
const createdId = crypto.randomUUID();
try {
  await jsonRequest(`${baseUrl}/rest/v1/baby_health?select=id&limit=1`, { headers });
  const created = await jsonRequest(`${baseUrl}/rest/v1/baby_health`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ id:createdId, health_type:'note', label:'FamilyPal smoke test', notes:marker, logged_at:new Date().toISOString() })
  });
  assert.equal(created?.[0]?.id, createdId, 'Smoke row was not returned after insert.');
  await jsonRequest(`${baseUrl}/rest/v1/baby_health?id=eq.${encodeURIComponent(createdId)}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer:'return=minimal' },
    body: JSON.stringify({ label:'FamilyPal smoke test updated' })
  });
  const verified = await jsonRequest(`${baseUrl}/rest/v1/baby_health?id=eq.${encodeURIComponent(createdId)}&select=id,label,notes`, { headers });
  assert.equal(verified?.[0]?.label, 'FamilyPal smoke test updated');
  assert.equal(verified?.[0]?.notes, marker);
  console.log('Authenticated test-project smoke checks passed: sign-in, read, insert, update, and read-back.');
} finally {
  await jsonRequest(`${baseUrl}/rest/v1/baby_health?id=eq.${encodeURIComponent(createdId)}`, { method:'DELETE', headers:{ ...headers, Prefer:'return=minimal' } });
  const remaining = await jsonRequest(`${baseUrl}/rest/v1/baby_health?id=eq.${encodeURIComponent(createdId)}&select=id`, { headers });
  assert.equal(remaining.length, 0, `Smoke row ${createdId} was not cleaned up.`);
  console.log('Smoke-test row removed.');
}
