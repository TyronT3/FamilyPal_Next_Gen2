(function (global, document) {
  'use strict';

  var CRYPTO_VERSION = 1;
  var KDF_ITERATIONS = 600000;
  var AUTO_LOCK_MS = 10 * 60 * 1000;
  var VAULT_AAD = 'familypal-journal-vault:v1';
  var encoder = new TextEncoder();
  var decoder = new TextDecoder();
  var vaultRow = null;
  var vaultKey = null;
  var decryptedEntries = [];
  var autoLockTimer = null;

  function element(id) { return document.getElementById(id); }
  function show(id, visible) { var el = element(id); if (el) el.style.display = visible ? '' : 'none'; }
  function setError(id, message) { var el = element(id); if (el) el.textContent = message || ''; }
  function escapeHtml(value) { var div = document.createElement('div'); div.textContent = value || ''; return div.innerHTML; }

  function bytesToBase64(value) {
    var bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    var binary = '';
    for (var i = 0; i < bytes.length; i += 32768) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    var binary = atob(value || '');
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function randomBytes(length) {
    return global.crypto.getRandomValues(new Uint8Array(length));
  }

  function newUuid() {
    if (global.crypto.randomUUID) return global.crypto.randomUUID();
    var bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.from(bytes).map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function entryAad(id) {
    return encoder.encode('familypal-journal-entry:v1:' + id);
  }

  async function deriveWrappingKey(passphrase, salt, iterations) {
    var material = await global.crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return global.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function importVaultKey(rawKey) {
    return global.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function setView(view) {
    show('journal-loading', view === 'loading');
    show('journal-setup', view === 'setup');
    show('journal-unlock', view === 'unlock');
    show('journal-open', view === 'open');
    show('journal-lock-button', view === 'open');
  }

  function resetAutoLock() {
    if (!vaultKey) return;
    global.clearTimeout(autoLockTimer);
    autoLockTimer = global.setTimeout(function () { lockJournal(true); }, AUTO_LOCK_MS);
  }

  function registerActivity() {
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (eventName) {
      document.addEventListener(eventName, function () { if (vaultKey) resetAutoLock(); }, { passive: true });
    });
  }

  function clearEditor() {
    element('journal-entry-id').value = '';
    element('journal-entry-title').value = '';
    element('journal-entry-body').value = '';
    element('journal-entry-date').value = '';
    setError('journal-entry-error', '');
  }

  function closeJournalEntry() {
    element('journal-entry-modal').style.display = 'none';
    clearEditor();
  }

  function closeJournalModalClick(event) {
    if (event.target === element('journal-entry-modal')) closeJournalEntry();
  }

  async function lockJournal(automatic) {
    var editor = element('journal-entry-modal');
    if (editor && editor.getAttribute('data-fp-dirty') === 'true') {
      var discard = await FamilyPalUI.confirm('The open journal entry has unsaved changes.', { title: automatic ? 'Journal ready to lock' : 'Lock journal?', confirmLabel: 'Discard and lock' });
      if (!discard) { resetAutoLock(); return; }
      FamilyPalUI.markSaved(editor);
    }
    global.clearTimeout(autoLockTimer);
    autoLockTimer = null;
    vaultKey = null;
    decryptedEntries = [];
    element('journal-entries').replaceChildren();
    element('journal-passphrase').value = '';
    closeJournalEntry();
    setView(vaultRow ? 'unlock' : 'setup');
    if (automatic) toast('Journal locked after inactivity');
  }

  function validateNewPassphrase(passphrase, confirmation) {
    if (passphrase.length < 16) return 'Use at least 16 characters for the journal passphrase.';
    if (passphrase !== confirmation) return 'The two passphrases do not match.';
    if (!element('journal-no-recovery').checked) return 'Confirm that you understand there is no passphrase recovery.';
    return '';
  }

  async function createJournalVault(button) {
    setError('journal-setup-error', '');
    var passphrase = element('journal-new-passphrase').value;
    var confirmation = element('journal-confirm-passphrase').value;
    var validationError = validateNewPassphrase(passphrase, confirmation);
    if (validationError) { setError('journal-setup-error', validationError); return; }
    FamilyPalUI.setBusy(button, true, 'Creating encrypted vault…');
    try {
      var salt = randomBytes(16);
      var wrapIv = randomBytes(12);
      var rawVaultKey = randomBytes(32);
      var wrappingKey = await deriveWrappingKey(passphrase, salt, KDF_ITERATIONS);
      var wrappedKey = await global.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: wrapIv, additionalData: encoder.encode(VAULT_AAD), tagLength: 128 },
        wrappingKey,
        rawVaultKey
      );
      var rows = await FamilyPal.requestJson('/rest/v1/journal_vaults', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          salt: bytesToBase64(salt),
          wrap_iv: bytesToBase64(wrapIv),
          wrapped_key: bytesToBase64(wrappedKey),
          kdf_iterations: KDF_ITERATIONS,
          crypto_version: CRYPTO_VERSION
        })
      });
      vaultRow = rows && rows[0];
      if (!vaultRow) throw new Error('The encrypted vault was not returned by the server.');
      vaultKey = await importVaultKey(rawVaultKey);
      rawVaultKey.fill(0);
      element('journal-new-passphrase').value = '';
      element('journal-confirm-passphrase').value = '';
      element('journal-no-recovery').checked = false;
      setView('open');
      resetAutoLock();
      await loadJournalEntries();
      toast('Private journal created');
    } catch (error) {
      setError('journal-setup-error', databaseSetupMessage(error));
      vaultKey = null;
    } finally {
      passphrase = '';
      confirmation = '';
      FamilyPalUI.setBusy(button, false);
    }
  }

  async function unlockJournal(button) {
    setError('journal-unlock-error', '');
    var passphrase = element('journal-passphrase').value;
    if (!passphrase) { setError('journal-unlock-error', 'Enter your journal passphrase.'); return; }
    FamilyPalUI.setBusy(button, true, 'Unlocking…');
    try {
      if (!vaultRow || vaultRow.crypto_version !== CRYPTO_VERSION) throw new Error('This journal uses an unsupported encryption version.');
      var salt = base64ToBytes(vaultRow.salt);
      var wrapIv = base64ToBytes(vaultRow.wrap_iv);
      var wrappingKey = await deriveWrappingKey(passphrase, salt, vaultRow.kdf_iterations);
      var rawVaultKey = await global.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: wrapIv, additionalData: encoder.encode(VAULT_AAD), tagLength: 128 },
        wrappingKey,
        base64ToBytes(vaultRow.wrapped_key)
      );
      vaultKey = await importVaultKey(rawVaultKey);
      new Uint8Array(rawVaultKey).fill(0);
      element('journal-passphrase').value = '';
      setView('open');
      resetAutoLock();
      await loadJournalEntries();
    } catch (error) {
      vaultKey = null;
      setError('journal-unlock-error', error && error.message && /unsupported/.test(error.message) ? error.message : 'That passphrase could not unlock this journal.');
    } finally {
      passphrase = '';
      FamilyPalUI.setBusy(button, false);
    }
  }

  async function encryptEntry(id, payload) {
    if (!vaultKey) throw new Error('Unlock the journal first.');
    var iv = randomBytes(12);
    var ciphertext = await global.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv, additionalData: entryAad(id), tagLength: 128 },
      vaultKey,
      encoder.encode(JSON.stringify(payload))
    );
    return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
  }

  async function decryptEntry(row) {
    try {
      if (row.crypto_version !== CRYPTO_VERSION) throw new Error('Unsupported encryption version');
      var plaintext = await global.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(row.iv), additionalData: entryAad(row.id), tagLength: 128 },
        vaultKey,
        base64ToBytes(row.ciphertext)
      );
      var payload = JSON.parse(decoder.decode(plaintext));
      return {
        id: row.id,
        title: typeof payload.title === 'string' ? payload.title : '',
        body: typeof payload.body === 'string' ? payload.body : '',
        entryDate: typeof payload.entryDate === 'string' ? payload.entryDate : row.created_at.slice(0, 10),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        failed: false
      };
    } catch (error) {
      return { id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, failed: true };
    }
  }

  function formatEntryDate(value) {
    var parts = (value || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[0]) return 'Undated';
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function renderJournalEntries() {
    var container = element('journal-entries');
    if (!decryptedEntries.length) {
      container.innerHTML = '<div class="empty-state"><div class="big">◇</div><div style="font-weight:750;color:var(--text);margin-bottom:5px">Your journal is empty</div><div>Write the first entry when you are ready.</div></div>';
      return;
    }
    container.innerHTML = decryptedEntries.map(function (entry) {
      if (entry.failed) {
        return '<div class="journal-entry journal-failed"><div class="journal-entry-title">Entry could not be decrypted</div><div class="journal-entry-preview">It may be damaged or use a different encryption version.</div></div>';
      }
      return '<button class="journal-entry" type="button" onclick="editJournalEntry(\'' + entry.id + '\')">' +
        '<span class="journal-entry-top"><span class="journal-entry-title">' + escapeHtml(entry.title || 'Untitled entry') + '</span><span class="journal-entry-date">' + escapeHtml(formatEntryDate(entry.entryDate)) + '</span></span>' +
        '<span class="journal-entry-preview">' + escapeHtml(entry.body || 'No text') + '</span>' +
      '</button>';
    }).join('');
  }

  async function loadJournalEntries() {
    if (!vaultKey) return;
    element('journal-entries').innerHTML = '<div class="journal-loading"><span class="spinner"></span><div style="margin-top:10px">Decrypting entries on this device…</div></div>';
    try {
      var rows = await FamilyPal.requestJson('/rest/v1/journal_entries?order=created_at.desc&select=id,ciphertext,iv,crypto_version,created_at,updated_at');
      decryptedEntries = await Promise.all((rows || []).map(decryptEntry));
      decryptedEntries.sort(function (a, b) {
        return (b.entryDate || b.createdAt || '').localeCompare(a.entryDate || a.createdAt || '');
      });
      renderJournalEntries();
    } catch (error) {
      element('journal-entries').innerHTML = '<div class="empty-state" style="color:var(--red)">Could not load encrypted entries: ' + escapeHtml(error.message) + '</div>';
    }
  }

  function localDateKey() {
    var date = new Date();
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function openJournalEntry() {
    if (!vaultKey) return;
    clearEditor();
    element('journal-entry-heading').textContent = 'New journal entry';
    element('journal-entry-date').value = localDateKey();
    element('journal-delete-button').style.display = 'none';
    element('journal-entry-modal').style.display = 'flex';
    global.setTimeout(function () { element('journal-entry-title').focus(); }, 0);
  }

  function editJournalEntry(id) {
    if (!vaultKey) return;
    var entry = decryptedEntries.find(function (item) { return item.id === id && !item.failed; });
    if (!entry) return;
    clearEditor();
    element('journal-entry-heading').textContent = 'Edit journal entry';
    element('journal-entry-id').value = entry.id;
    element('journal-entry-date').value = entry.entryDate;
    element('journal-entry-title').value = entry.title;
    element('journal-entry-body').value = entry.body;
    element('journal-delete-button').style.display = '';
    element('journal-entry-modal').style.display = 'flex';
    global.setTimeout(function () { element('journal-entry-body').focus(); }, 0);
  }

  async function saveJournalEntry(button) {
    setError('journal-entry-error', '');
    if (!vaultKey) { setError('journal-entry-error', 'The journal is locked.'); return; }
    var id = element('journal-entry-id').value || newUuid();
    var title = element('journal-entry-title').value.trim();
    var body = element('journal-entry-body').value.trim();
    var entryDate = element('journal-entry-date').value || localDateKey();
    if (!title && !body) { setError('journal-entry-error', 'Write a title or journal entry before saving.'); return; }
    FamilyPalUI.setBusy(button, true, 'Encrypting…');
    try {
      var encrypted = await encryptEntry(id, { version: CRYPTO_VERSION, title: title, body: body, entryDate: entryDate });
      var record = { ciphertext: encrypted.ciphertext, iv: encrypted.iv, crypto_version: CRYPTO_VERSION, updated_at: new Date().toISOString() };
      if (element('journal-entry-id').value) {
        await FamilyPal.requestJson('/rest/v1/journal_entries?id=eq.' + encodeURIComponent(id), {
          method: 'PATCH',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(record)
        });
      } else {
        record.id = id;
        await FamilyPal.requestJson('/rest/v1/journal_entries', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(record)
        });
      }
      closeJournalEntry();
      await loadJournalEntries();
      resetAutoLock();
      toast('Journal entry saved securely');
    } catch (error) {
      setError('journal-entry-error', 'Could not save this encrypted entry: ' + error.message);
    } finally {
      FamilyPalUI.setBusy(button, false);
    }
  }

  async function deleteJournalEntry() {
    var id = element('journal-entry-id').value;
    if (!id || !vaultKey) return;
    var confirmed = await FamilyPalUI.confirm('This encrypted journal entry will be permanently deleted.', { title: 'Delete journal entry?', confirmLabel: 'Delete' });
    if (!confirmed) return;
    try {
      await FamilyPal.requestJson('/rest/v1/journal_entries?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      closeJournalEntry();
      await loadJournalEntries();
      toast('Journal entry deleted');
    } catch (error) {
      setError('journal-entry-error', 'Could not delete this entry: ' + error.message);
    }
  }

  function databaseSetupMessage(error) {
    var message = error && error.message ? error.message : 'Could not open JournalPal.';
    if (/journal_vaults|relation|schema cache|404/i.test(message)) return 'JournalPal needs its Supabase migration before it can be used.';
    return message;
  }

  var toastTimer = null;
  function toast(message) {
    var target = element('toast');
    target.textContent = message;
    target.classList.add('show');
    global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(function () { target.classList.remove('show'); }, 2600);
  }

  async function initJournal() {
    if (!global.crypto || !global.crypto.subtle) {
      element('journal-loading').innerHTML = '<div style="color:var(--red)">This browser does not support the encryption required by JournalPal.</div>';
      return;
    }
    if (!await FamilyPal.requireSession()) return;
    FamilyPal.startTokenRefresh();
    element('journal-screen').style.display = 'flex';
    document.querySelectorAll('[data-journal-email]').forEach(function (target) { target.textContent = FamilyPal.getEmail() || ''; });
    FamilyPalUI.loadProfile();
    registerActivity();
    try {
      var rows = await FamilyPal.requestJson('/rest/v1/journal_vaults?select=owner_id,salt,wrap_iv,wrapped_key,kdf_iterations,crypto_version,created_at,updated_at&limit=1');
      vaultRow = rows && rows[0] ? rows[0] : null;
      setView(vaultRow ? 'unlock' : 'setup');
    } catch (error) {
      element('journal-loading').innerHTML = '<div style="color:var(--red);font-weight:700;margin-bottom:6px">JournalPal is not ready</div><div>' + escapeHtml(databaseSetupMessage(error)) + '</div>';
    }
  }

  global.createJournalVault = createJournalVault;
  global.unlockJournal = unlockJournal;
  global.lockJournal = lockJournal;
  global.openJournalEntry = openJournalEntry;
  global.editJournalEntry = editJournalEntry;
  global.saveJournalEntry = saveJournalEntry;
  global.deleteJournalEntry = deleteJournalEntry;
  global.closeJournalEntry = closeJournalEntry;
  global.closeJournalModalClick = closeJournalModalClick;

  global.addEventListener('pagehide', function () { vaultKey = null; decryptedEntries = []; });
  global.onload = initJournal;
})(window, document);
