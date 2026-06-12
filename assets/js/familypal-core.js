(function (global) {
  var config = {
    supabaseUrl: 'https://kfbvmabnblxwznmrjhny.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmYnZtYWJuYmx4d3pubXJqaG55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MjM1MjQsImV4cCI6MjA5NjM5OTUyNH0._m5LmH81Xk3RU63jvKO7vs8R4lnPINHD3MMAXJwQOxc'
  };

  function getEmail() {
    return localStorage.getItem('fp_email');
  }

  function getPassword() {
    return localStorage.getItem('fp_pass');
  }

  function rememberCredentials(email, password) {
    localStorage.setItem('fp_email', email);
    localStorage.setItem('fp_pass', password);
  }

  function clearCredentials() {
    localStorage.removeItem('fp_email');
    localStorage.removeItem('fp_pass');
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

  async function requestJson(path, opts) {
    opts = opts || {};
    var response = await fetch(config.supabaseUrl + path, Object.assign({}, opts, {
      headers: Object.assign({
        'Content-Type': 'application/json',
        'apikey': config.supabaseAnonKey,
        'Authorization': 'Bearer ' + config.supabaseAnonKey
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
    rememberCredentials(email, password);
    return data;
  }

  async function tryStoredSignIn() {
    var email = getEmail();
    var password = getPassword();
    if (!email || !password) return false;
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
    getPassword: getPassword,
    requireAuth: requireAuth,
    authJson: authJson,
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
