(function (global) {
  // Clear any legacy plaintext password stored by older app versions
  localStorage.removeItem('fp_pass');

  // Sessions created while refresh requests were racing can contain a stale
  // access/refresh-token pair. Reset those sessions once so the app can recover
  // at the sign-in screen instead of leaving every dashboard request pending.
  var sessionStorageVersion = '20260715.4';
  if (localStorage.getItem('fp_session_version') !== sessionStorageVersion) {
    localStorage.removeItem('fp_email');
    localStorage.removeItem('fp_access_token');
    localStorage.removeItem('fp_refresh_token');
    localStorage.removeItem('fp_token_expires_at');
    localStorage.setItem('fp_session_version', sessionStorageVersion);
  }

  var config = {
    supabaseUrl: 'https://dcevozgqpemuivhakgro.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZXZvemdxcGVtdWl2aGFrZ3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMzQxNjIsImV4cCI6MjA5NjgxMDE2Mn0.ocqU2aqmpDo74G-GbaFBwCjY5avws-48DeXyoeyjGOg'
  };

  function getEmail() {
    return localStorage.getItem('fp_email');
  }

  function getPassword() {
    return localStorage.getItem('fp_pass');
  }

  function getAccessToken() {
    return localStorage.getItem('fp_access_token');
  }

  function getRefreshToken() {
    return localStorage.getItem('fp_refresh_token');
  }

  async function getSetting(key) {
    var rows = await requestJson('/rest/v1/settings?key=eq.' + encodeURIComponent(key) + '&select=value&limit=1');
    return rows && rows[0] ? rows[0].value || '' : null;
  }

  async function getSettings(keys) {
    keys = Array.isArray(keys) ? keys.filter(Boolean) : [];
    if (!keys.length) return {};
    var rows = await requestJson('/rest/v1/settings?key=in.(' + keys.map(encodeURIComponent).join(',') + ')&select=key,value');
    var values = {};
    keys.forEach(function (key) { values[key] = null; });
    (rows || []).forEach(function (row) { values[row.key] = row.value || ''; });
    return values;
  }

  async function setSetting(key, value) {
    var body = { key: key, value: value || '', updated_at: new Date().toISOString() };
    var rows = await requestJson('/rest/v1/settings?on_conflict=key', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(body)
    });
    return rows && rows[0] ? rows[0] : body;
  }

  async function getDiaperItemId() {
    try {
      var sharedValue = await getSetting('diaper_item_id');
      if (sharedValue !== null) {
        if (sharedValue) localStorage.setItem('bp_diaper_item_id', sharedValue);
        else localStorage.removeItem('bp_diaper_item_id');
        return sharedValue;
      }
    } catch (e) {}
    return localStorage.getItem('bp_diaper_item_id') || '';
  }

  async function setDiaperItemId(itemId) {
    await setSetting('diaper_item_id', itemId || '');
    if (itemId) localStorage.setItem('bp_diaper_item_id', itemId);
    else localStorage.removeItem('bp_diaper_item_id');
  }

  function rememberSession(email, session) {
    var sessionEmail = email || (session.user && session.user.email);
    if (sessionEmail) localStorage.setItem('fp_email', sessionEmail);
    localStorage.removeItem('fp_pass');
    if (session.access_token) localStorage.setItem('fp_access_token', session.access_token);
    if (session.refresh_token) localStorage.setItem('fp_refresh_token', session.refresh_token);
    if (session.expires_in) {
      localStorage.setItem('fp_token_expires_at', String(Date.now() + (session.expires_in * 1000)));
    }
  }

  function clearCredentials() {
    localStorage.removeItem('fp_email');
    localStorage.removeItem('fp_pass');
    localStorage.removeItem('fp_access_token');
    localStorage.removeItem('fp_refresh_token');
    localStorage.removeItem('fp_token_expires_at');
  }

  function requireAuth() {
    if (!getEmail()) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  async function requireSession() {
    if (!getEmail()) {
      window.location.href = 'index.html';
      return false;
    }
    // Let authenticated pages render immediately. Data requests can refresh a
    // near-expiry token in the background without making navigation look stuck.
    if (getAccessToken()) return true;
    var token = await getAuthToken();
    if (!token) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  function signOut() {
    clearCredentials();
    window.location.href = 'index.html';
  }

  function tokenExpiresSoon() {
    var expiresAt = parseInt(localStorage.getItem('fp_token_expires_at') || '0', 10);
    return !expiresAt || Date.now() > expiresAt - 60000;
  }

  var _refreshPromise = null;
  async function refreshSession() {
    if (_refreshPromise) return _refreshPromise;
    var refreshToken = getRefreshToken();
    if (!refreshToken) return null;
    var email = getEmail();
    _refreshPromise = (async function () {
      var data = await authJson('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      rememberSession(email || '', data);
      return data.access_token;
    })();
    try {
      return await _refreshPromise;
    } finally {
      _refreshPromise = null;
    }
  }

  async function getAuthToken() {
    var token = getAccessToken();
    if (token && !tokenExpiresSoon()) return token;
    try {
      var refreshedToken = await refreshSession();
      if (refreshedToken) return refreshedToken;
      clearCredentials();
      return null;
    } catch (e) {
      clearCredentials();
      return null;
    }
  }

  async function fetchWithTimeout(url, opts, timeoutMs) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs || 12000) : null;
    try {
      return await fetch(url, Object.assign({}, opts || {}, controller ? { signal: controller.signal } : {}));
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('The server took too long to respond. Please try again.');
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function requestJson(path, opts) {
    opts = opts || {};
    var token = await getAuthToken();
    if (!token) throw new Error('Please sign in again.');
    var response = await fetchWithTimeout(config.supabaseUrl + path, Object.assign({}, opts, {
      headers: Object.assign({
        'Content-Type': 'application/json',
        'apikey': config.supabaseAnonKey,
        'Authorization': 'Bearer ' + token
      }, opts.headers || {})
    }), 12000);
    var data = await response.json().catch(function () { return {}; });
    if (response.status === 401) {
      clearCredentials();
      if (!/index\.html$/.test(window.location.pathname)) window.location.replace('index.html?session=expired');
      throw new Error('Your session expired. Please sign in again.');
    }
    if (!response.ok) throw new Error(data.message || data.error || response.status);
    return data;
  }

  async function decrementPantryItem(itemId, action) {
    if (!itemId) return { skipped: true };
    var items = await requestJson('/rest/v1/items?id=eq.' + encodeURIComponent(itemId) + '&select=id,name,qty_stocked');
    var item = Array.isArray(items) ? items[0] : null;
    if (!item) return { skipped: true, missing: true };
    var currentQty = parseInt(item.qty_stocked || 0, 10);
    var nextQty = Math.max(0, currentQty - 1);
    await requestJson('/rest/v1/items?id=eq.' + encodeURIComponent(itemId), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ qty_stocked: nextQty, updated_at: new Date().toISOString() })
    });
    try {
      await requestJson('/rest/v1/history', {
        method: 'POST',
        body: JSON.stringify({ item_id: itemId, action: action || 'Used 1 item' })
      });
    } catch (e) {}
    return { skipped: false, name: item.name, previousQty: currentQty, qty_stocked: nextQty };
  }

  async function incrementPantryItem(itemId, action) {
    if (!itemId) return { skipped: true };
    var items = await requestJson('/rest/v1/items?id=eq.' + encodeURIComponent(itemId) + '&select=id,name,qty_stocked');
    var item = Array.isArray(items) ? items[0] : null;
    if (!item) return { skipped: true, missing: true };
    var currentQty = parseInt(item.qty_stocked || 0, 10);
    var nextQty = currentQty + 1;
    await requestJson('/rest/v1/items?id=eq.' + encodeURIComponent(itemId), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ qty_stocked: nextQty, updated_at: new Date().toISOString() })
    });
    try {
      await requestJson('/rest/v1/history', {
        method: 'POST',
        body: JSON.stringify({ item_id: itemId, action: action || 'Restored 1 item' })
      });
    } catch (e) {}
    return { skipped: false, name: item.name, previousQty: currentQty, qty_stocked: nextQty };
  }

  async function decrementDiaperStock(source) {
    var itemId = await getDiaperItemId();
    if (!itemId) return { skipped: true };
    return decrementPantryItem(itemId, 'Used 1 diaper (' + (source || 'BabyPal') + ')');
  }

  async function incrementDiaperStock(source) {
    var itemId = await getDiaperItemId();
    if (!itemId) return { skipped: true };
    return incrementPantryItem(itemId, 'Restored 1 diaper (' + (source || 'BabyPal undo') + ')');
  }

  async function authJson(path, opts) {
    opts = opts || {};
    var response = await fetchWithTimeout(config.supabaseUrl + path, Object.assign({}, opts, {
      headers: Object.assign({
        'Content-Type': 'application/json',
        'apikey': config.supabaseAnonKey
      }, opts.headers || {})
    }), 12000);
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.message || data.error || response.status);
    return data;
  }

  async function signIn(email, password) {
    var data = await authJson('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: email, password: password })
    });
    rememberSession(email, data);
    return data;
  }

  async function tryStoredSignIn() {
    var email = getEmail();
    if (!email) return false;
    if (getRefreshToken()) {
      await refreshSession();
      return true;
    }
    var password = getPassword();
    if (!password) return false;
    await signIn(email, password);
    return true;
  }

  async function signUp(email, password) {
    return authJson('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email: email, password: password })
    });
  }

  async function resetPassword(email) {
    return authJson('/auth/v1/recover', {
      method: 'POST',
      body: JSON.stringify({ email: email })
    });
  }

  var _refreshInterval = null;
  function startTokenRefresh() {
    if (_refreshInterval) return;
    _refreshInterval = setInterval(function () {
      if (!getEmail()) { stopTokenRefresh(); return; }
      refreshSession().catch(function () {});
    }, 30 * 60 * 1000);
  }
  function stopTokenRefresh() {
    if (_refreshInterval) { clearInterval(_refreshInterval); _refreshInterval = null; }
  }

  global.FamilyPal = {
    config: config,
    getEmail: getEmail,
    getAccessToken: getAccessToken,
    getRefreshToken: getRefreshToken,
    getSetting: getSetting,
    getSettings: getSettings,
    setSetting: setSetting,
    getDiaperItemId: getDiaperItemId,
    setDiaperItemId: setDiaperItemId,
    requireAuth: requireAuth,
    requireSession: requireSession,
    authJson: authJson,
    refreshSession: refreshSession,
    requestJson: requestJson,
    sbFetch: requestJson,
    decrementPantryItem: decrementPantryItem,
    incrementPantryItem: incrementPantryItem,
    decrementDiaperStock: decrementDiaperStock,
    incrementDiaperStock: incrementDiaperStock,
    signIn: signIn,
    signUp: signUp,
    resetPassword: resetPassword,
    signOut: signOut,
    tryStoredSignIn: tryStoredSignIn,
    startTokenRefresh: startTokenRefresh,
    stopTokenRefresh: stopTokenRefresh
  };

  global.SB_URL = config.supabaseUrl;
  global.SB_KEY = config.supabaseAnonKey;
  global.SUPABASE_URL = config.supabaseUrl;
  global.SUPABASE_KEY = config.supabaseAnonKey;
  global.sbFetch = requestJson;
})(window);
