(function (global) {
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

  function signOut() {
    clearCredentials();
    window.location.href = 'index.html';
  }

  function tokenExpiresSoon() {
    var expiresAt = parseInt(localStorage.getItem('fp_token_expires_at') || '0', 10);
    return !expiresAt || Date.now() > expiresAt - 60000;
  }

  async function refreshSession() {
    var refreshToken = getRefreshToken();
    if (!refreshToken) return null;
    var email = getEmail();
    var data = await authJson('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    rememberSession(email || '', data);
    return data.access_token;
  }

  async function getAuthToken() {
    var token = getAccessToken();
    if (token && !tokenExpiresSoon()) return token;
    try {
      return await refreshSession();
    } catch (e) {
      clearCredentials();
      return null;
    }
  }

  async function requestJson(path, opts) {
    opts = opts || {};
    var token = await getAuthToken();
    if (!token) throw new Error('Please sign in again.');
    var response = await fetch(config.supabaseUrl + path, Object.assign({}, opts, {
      headers: Object.assign({
        'Content-Type': 'application/json',
        'apikey': config.supabaseAnonKey,
        'Authorization': 'Bearer ' + token
      }, opts.headers || {})
    }));
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.message || data.error || response.status);
    return data;
  }

  async function authJson(path, opts) {
    opts = opts || {};
    var response = await fetch(config.supabaseUrl + path, Object.assign({}, opts, {
      headers: Object.assign({
        'Content-Type': 'application/json',
        'apikey': config.supabaseAnonKey
      }, opts.headers || {})
    }));
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

  global.FamilyPal = {
    config: config,
    getEmail: getEmail,
    getAccessToken: getAccessToken,
    getRefreshToken: getRefreshToken,
    requireAuth: requireAuth,
    authJson: authJson,
    refreshSession: refreshSession,
    requestJson: requestJson,
    sbFetch: requestJson,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    tryStoredSignIn: tryStoredSignIn
  };

  global.SB_URL = config.supabaseUrl;
  global.SB_KEY = config.supabaseAnonKey;
  global.SUPABASE_URL = config.supabaseUrl;
  global.SUPABASE_KEY = config.supabaseAnonKey;
  global.sbFetch = requestJson;
})(window);
