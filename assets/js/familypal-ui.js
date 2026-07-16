(function (global, document) {
  'use strict';

  var profile = {
    householdName: 'FamilyPal',
    babyName: 'Geomé',
    person1Name: 'Tyron',
    person2Name: 'Ansonette',
    babyPronouns: 'she',
    hidePeriodDetails: true,
    isConfigured: false
  };
  var profileReady = null;
  var confirmResolver = null;
  var lastModalTrigger = null;
  var personalizing = false;
  var handlingHistoryPop = false;
  var unwindingHistory = false;

  function pronouns() {
    if (profile.babyPronouns === 'he') return { subject: 'he', Subject: 'He', object: 'him', possessive: 'his' };
    if (profile.babyPronouns === 'they') return { subject: 'they', Subject: 'They', object: 'them', possessive: 'their' };
    return { subject: 'she', Subject: 'She', object: 'her', possessive: 'her' };
  }

  function replaceProfileTokens(value) {
    return String(value || '').replace(/Geomé|Tyron|Ansonette/g, function (token) {
      if (token === 'Geomé') return profile.babyName;
      if (token === 'Tyron') return profile.person1Name;
      return profile.person2Name;
    });
  }

  function applyProfileToText(root) {
    if (!root || personalizing) return;
    personalizing = true;
    try {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var nodes = [];
      var node;
      while ((node = walker.nextNode())) nodes.push(node);
      var p = pronouns();
      nodes.forEach(function (textNode) {
        var parent = textNode.parentElement;
        if (!parent || /^(SCRIPT|STYLE|TEXTAREA)$/.test(parent.tagName) || parent.closest('[data-private-content],[data-no-personalize]')) return;
        var text = textNode.nodeValue;
        var next = replaceProfileTokens(text);
        if (document.body && document.body.dataset.app === 'baby') {
          next = next.replace(/\bShe\b/g, p.Subject).replace(/\bshe\b/g, p.subject);
        }
        if (next !== text) textNode.nodeValue = next;
      });
      document.querySelectorAll('[data-household-name]').forEach(function (el) { if (el.textContent !== profile.householdName) el.textContent = profile.householdName; });
      document.querySelectorAll('[data-baby-name]').forEach(function (el) { if (el.textContent !== profile.babyName) el.textContent = profile.babyName; });
      document.querySelectorAll('[data-person-1]').forEach(function (el) { if (el.textContent !== profile.person1Name) el.textContent = profile.person1Name; });
      document.querySelectorAll('[data-person-2]').forEach(function (el) { if (el.textContent !== profile.person2Name) el.textContent = profile.person2Name; });
      document.querySelectorAll('[placeholder]').forEach(function (el) {
        if (el.closest('[data-private-content],[data-no-personalize]')) return;
        var value = el.getAttribute('placeholder') || '';
        var personalizedValue = replaceProfileTokens(value);
        if (personalizedValue !== value) el.setAttribute('placeholder', personalizedValue);
      });
      document.title = replaceProfileTokens(document.title);
    } finally {
      personalizing = false;
    }
  }

  async function loadProfile(force) {
    if (profileReady && !force) return profileReady;
    profileReady = (async function () {
      if (!global.FamilyPal || !FamilyPal.getEmail || !FamilyPal.getEmail()) return profile;
      try {
        var values = await FamilyPal.getSettings(['household_name','baby_name','person_1_name','person_2_name','baby_pronouns','hide_period_details']);
        profile.householdName = values.household_name || profile.householdName;
        profile.babyName = values.baby_name || profile.babyName;
        profile.person1Name = values.person_1_name || profile.person1Name;
        profile.person2Name = values.person_2_name || profile.person2Name;
        profile.babyPronouns = values.baby_pronouns || profile.babyPronouns;
        profile.hidePeriodDetails = values.hide_period_details === null || values.hide_period_details === '' ? true : values.hide_period_details === 'true';
        profile.isConfigured = !!(values.household_name && values.baby_name && values.person_1_name && values.person_2_name);
        if (global.FamilyPal) FamilyPal.profile = profile;
        applyProfileToText(document.body);
        document.dispatchEvent(new CustomEvent('familypal:profile', { detail: profile }));
      } catch (e) {}
      return profile;
    })();
    return profileReady;
  }

  function enhanceClickable(root) {
    if (!root || root.nodeType !== 1) return;
    var elements = [];
    if (root.matches && root.matches('div[onclick], span[onclick]')) elements.push(root);
    if (root.querySelectorAll) elements = elements.concat(Array.from(root.querySelectorAll('div[onclick], span[onclick]')));
    elements.forEach(function (el) {
      if (el.classList.contains('modal-overlay')) return;
      if (el.hasAttribute('data-fp-keyboard')) return;
      el.setAttribute('data-fp-keyboard', 'true');
      el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      el.addEventListener('keydown', function (event) {
        if (event.target !== el) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          el.click();
        }
      });
    });
  }

  function enhanceTabs(root) {
    var scopes = [];
    if (root && root.matches && root.matches('.tabs')) scopes.push(root);
    if (root && root.querySelectorAll) scopes = scopes.concat(Array.from(root.querySelectorAll('.tabs')));
    scopes.forEach(function (tabs) {
      tabs.setAttribute('role', 'tablist');
      tabs.querySelectorAll('.tab').forEach(function (tab, index) {
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
        if (!tab.id) tab.id = 'fp-tab-' + (document.body.dataset.app || 'app') + '-' + index;
        var handler = tab.getAttribute('onclick') || '';
        var match = handler.match(/switch(?:Wellbeing)?Tab\('([^']+)'/);
        var panel = match && (document.getElementById('tab-' + match[1]) || document.getElementById('wellbeing-tab-' + match[1]));
        if (panel) {
          tab.setAttribute('aria-controls', panel.id);
          panel.setAttribute('role', 'tabpanel');
          panel.setAttribute('aria-labelledby', tab.id);
        }
        if (!tab.hasAttribute('data-fp-tab-keys')) {
          tab.setAttribute('data-fp-tab-keys', 'true');
          tab.addEventListener('keydown', function (event) {
            var keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
            if (keys.indexOf(event.key) < 0) return;
            event.preventDefault();
            var choices = Array.from(tabs.querySelectorAll('.tab'));
            var current = choices.indexOf(tab);
            var next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + choices.length) % choices.length;
            choices[next].focus();
            choices[next].click();
          });
        }
      });
    });
  }

  function enhanceFormLabels(root) {
    var scopes = [];
    if (root && root.matches && root.matches('.field, .time-row, .date-row')) scopes.push(root);
    if (root && root.querySelectorAll) scopes = scopes.concat(Array.from(root.querySelectorAll('.field, .time-row, .date-row')));
    scopes.forEach(function (scope) {
      var control = scope.querySelector('input:not([type="hidden"]), select, textarea');
      var label = scope.querySelector('label:not([for])');
      if (!control || !label || !control.id) return;
      label.setAttribute('for', control.id);
    });
  }

  function enhanceModals(root) {
    var overlays = [];
    if (root && root.matches && root.matches('.modal-overlay')) overlays.push(root);
    if (root && root.querySelectorAll) overlays = overlays.concat(Array.from(root.querySelectorAll('.modal-overlay')));
    overlays.forEach(function (overlay, index) {
      overlay.setAttribute('aria-hidden', overlay.style.display === 'none' ? 'true' : 'false');
      var modal = overlay.querySelector('.modal');
      if (!modal) return;
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.querySelectorAll('.modal-close').forEach(function (button) {
        if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', 'Close dialog');
      });
      var heading = modal.querySelector('h2, h3');
      if (heading) {
        if (!heading.id) heading.id = (overlay.id || 'dialog-' + index) + '-heading';
        modal.setAttribute('aria-labelledby', heading.id);
      }
    });
  }

  function setActiveTab(target) {
    var tabs = target && target.closest ? target.closest('.tabs') : null;
    if (!tabs) return;
    tabs.querySelectorAll('.tab').forEach(function (tab) {
      tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
    });
  }

  function injectBottomNav() {
    var app = document.body && document.body.dataset.app;
    if (!app || app === 'auth' || document.querySelector('.fp-bottom-nav')) return;
    var nav = document.createElement('nav');
    nav.className = 'fp-bottom-nav';
    nav.setAttribute('aria-label', 'FamilyPal sections');
    var items = [
      { id: 'home', href: 'home.html', symbol: '⌂', label: 'Home' },
      { id: 'pantry', href: 'pantrypal.html', symbol: '□', label: 'Pantry' },
      { id: 'baby', href: 'babypal.html', symbol: '○', label: 'Baby' },
      { id: 'chores', href: 'chorepal.html', symbol: '✓', label: 'Chores' }
    ];
    nav.innerHTML = items.map(function (item) {
      return '<a class="fp-nav-item ' + (app === item.id ? 'active' : '') + '" ' + (app === item.id ? 'aria-current="page" ' : '') + 'href="' + item.href + '"><span class="fp-nav-symbol" aria-hidden="true">' + item.symbol + '</span><span>' + item.label + '</span></a>';
    }).join('') + '<button class="fp-nav-item ' + (app === 'period' || app === 'wellbeing' || app === 'journal' || app === 'settings' || app === 'price' ? 'active' : '') + '" type="button" data-fp-more><span class="fp-nav-symbol" aria-hidden="true">•••</span><span>More</span></button>';
    document.body.appendChild(nav);
    injectMoreSheet();
    nav.querySelector('[data-fp-more]').addEventListener('click', openMoreSheet);
  }

  function injectMoreSheet() {
    if (document.getElementById('fp-more-sheet')) return;
    var overlay = document.createElement('div');
    overlay.id = 'fp-more-sheet';
    overlay.className = 'modal-overlay fp-more-sheet';
    overlay.style.display = 'none';
    overlay.innerHTML = '<div class="modal"><div class="modal-handle"></div><button class="modal-close" type="button" data-fp-close aria-label="Close">×</button><h2>More from FamilyPal</h2><div class="fp-more-grid"><button class="fp-more-action" type="button" data-href="periodpal.html"><strong>PeriodPal</strong><span>Cycle calendar and health records</span></button><button class="fp-more-action" type="button" data-href="wellbeingpal.html"><strong>WellbeingPal</strong><span>Shared health check-ins and patterns</span></button><button class="fp-more-action" type="button" data-href="journalpal.html"><strong>JournalPal</strong><span>Your personal encrypted journal</span></button><button class="fp-more-action" type="button" data-href="settings.html"><strong>Settings</strong><span>Household, appearance and account</span></button></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (event) { if (event.target === overlay) closeMoreSheet(); });
    overlay.querySelector('[data-fp-close]').addEventListener('click', closeMoreSheet);
    overlay.querySelectorAll('[data-href]').forEach(function (button) {
      button.addEventListener('click', function () { global.location.href = button.dataset.href; });
    });
    enhanceModals(overlay);
  }

  function openMoreSheet() {
    var overlay = document.getElementById('fp-more-sheet');
    if (!overlay) return;
    lastModalTrigger = document.activeElement;
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    var close = overlay.querySelector('[data-fp-close]');
    if (close) close.focus();
  }

  function closeMoreSheet() {
    var overlay = document.getElementById('fp-more-sheet');
    if (!overlay) return;
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
    if (lastModalTrigger && lastModalTrigger.focus) lastModalTrigger.focus();
  }

  function injectConfirmDialog() {
    if (document.getElementById('fp-confirm-dialog')) return;
    var overlay = document.createElement('div');
    overlay.id = 'fp-confirm-dialog';
    overlay.className = 'modal-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = '<div class="modal"><div class="modal-handle"></div><h2 id="fp-confirm-title">Are you sure?</h2><p class="fp-confirm-message" id="fp-confirm-message"></p><div class="fp-confirm-actions"><button class="btn btn-secondary" type="button" data-fp-confirm-cancel>Cancel</button><button class="btn btn-danger" type="button" data-fp-confirm-accept>Continue</button></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('[data-fp-confirm-cancel]').addEventListener('click', function () { resolveConfirm(false); });
    overlay.querySelector('[data-fp-confirm-accept]').addEventListener('click', function () { resolveConfirm(true); });
    overlay.addEventListener('click', function (event) { if (event.target === overlay) resolveConfirm(false); });
    enhanceModals(overlay);
  }

  function confirmAction(message, options) {
    options = options || {};
    injectConfirmDialog();
    var overlay = document.getElementById('fp-confirm-dialog');
    overlay.querySelector('#fp-confirm-title').textContent = options.title || 'Confirm this action';
    overlay.querySelector('#fp-confirm-message').textContent = message;
    overlay.querySelector('[data-fp-confirm-accept]').textContent = options.confirmLabel || 'Continue';
    lastModalTrigger = document.activeElement;
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    overlay.querySelector('[data-fp-confirm-cancel]').focus();
    return new Promise(function (resolve) { confirmResolver = resolve; });
  }

  function resolveConfirm(value) {
    var overlay = document.getElementById('fp-confirm-dialog');
    if (overlay) {
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden', 'true');
    }
    var resolver = confirmResolver;
    confirmResolver = null;
    if (resolver) resolver(value);
    if (lastModalTrigger && lastModalTrigger.focus) lastModalTrigger.focus();
  }

  function visibleModal() {
    return Array.from(document.querySelectorAll('.modal-overlay')).reverse().find(function (overlay) {
      return global.getComputedStyle(overlay).display !== 'none';
    });
  }

  function closeTopModal() {
    var overlay = visibleModal();
    if (!overlay) return;
    if (overlay.id === 'fp-confirm-dialog') return resolveConfirm(false);
    if (overlay.id === 'fp-more-sheet') return closeMoreSheet();
    var close = overlay.querySelector('.modal-close');
    if (close) close.click();
    else {
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function isVisibleModal(overlay) {
    return !!(overlay && global.getComputedStyle(overlay).display !== 'none');
  }

  function underlyingHistoryModal() {
    return Array.from(document.querySelectorAll('.modal-overlay')).reverse().find(function (overlay) {
      return overlay.id !== 'fp-confirm-dialog' && isVisibleModal(overlay);
    });
  }

  function historyModal() {
    return underlyingHistoryModal() || (isVisibleModal(document.getElementById('fp-confirm-dialog')) ? document.getElementById('fp-confirm-dialog') : null);
  }

  function modalIsDirty(overlay) {
    return !!(overlay && overlay.hasAttribute('data-fp-guard-dirty') && overlay.getAttribute('data-fp-dirty') === 'true');
  }

  function markSaved(target) {
    var overlay = typeof target === 'string' ? document.getElementById(target) : target;
    if (overlay) overlay.setAttribute('data-fp-dirty', 'false');
  }

  async function confirmDiscard(overlay) {
    if (!modalIsDirty(overlay)) return true;
    return confirmAction('Your unsaved changes in this form will be lost.', { title: 'Discard changes?', confirmLabel: 'Discard' });
  }

  function performModalClose(overlay) {
    if (!overlay) return;
    if (overlay.id === 'fp-confirm-dialog') { resolveConfirm(false); return; }
    overlay.setAttribute('data-fp-discard-approved', 'true');
    var close = overlay.querySelector('.modal-close, [data-fp-discard-close]');
    if (close) close.click();
    else {
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function tabStorageKey(tabs, index) {
    return 'fp_tab_' + (document.body.dataset.app || global.location.pathname) + '_' + index;
  }

  function rememberTab(tab) {
    var tabs = tab && tab.closest ? tab.closest('.tabs') : null;
    if (!tabs) return;
    var groups = Array.from(document.querySelectorAll('.tabs'));
    var choices = Array.from(tabs.querySelectorAll('.tab'));
    try { global.sessionStorage.setItem(tabStorageKey(tabs, groups.indexOf(tabs)), String(choices.indexOf(tab))); } catch (e) {}
  }

  function restoreTabs() {
    var groups = Array.from(document.querySelectorAll('.tabs'));
    groups.forEach(function (tabs, groupIndex) {
      var value;
      try { value = global.sessionStorage.getItem(tabStorageKey(tabs, groupIndex)); } catch (e) { return; }
      if (value === null) return;
      var choices = Array.from(tabs.querySelectorAll('.tab'));
      var tab = choices[Number(value)];
      if (tab && !tab.classList.contains('active') && !tab.disabled) tab.click();
    });
  }

  function syncModalHistory(changedShown, changedHidden) {
    var top = historyModal();
    var stateId = global.history.state && global.history.state.fpOverlay;
    if (handlingHistoryPop) { handlingHistoryPop = false; return; }
    if (top) {
      if (stateId === top.id) return;
      var previous = stateId && document.getElementById(stateId);
      if (stateId && changedHidden.indexOf(stateId) >= 0 && changedShown.indexOf(top.id) >= 0 && !isVisibleModal(previous)) {
        global.history.replaceState(Object.assign({}, global.history.state, { fpOverlay: top.id }), '');
      } else if (stateId && changedHidden.indexOf(stateId) >= 0 && !isVisibleModal(previous)) {
        unwindingHistory = true;
        global.history.back();
      } else {
        global.history.pushState(Object.assign({}, global.history.state, { fpOverlay: top.id }), '');
      }
    } else if (stateId) {
      unwindingHistory = true;
      global.history.back();
    }
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    var overlay = visibleModal();
    if (!overlay) return;
    var focusable = Array.from(overlay.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')).filter(function (el) { return el.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.fpLabel = button.textContent;
      button.textContent = label || 'Working…';
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    } else {
      button.textContent = button.dataset.fpLabel || button.textContent;
      delete button.dataset.fpLabel;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  async function runBusy(button, label, callback) {
    if (button && button.disabled) return;
    setBusy(button, true, label);
    try { return await callback(); }
    finally { setBusy(button, false); }
  }

  function offerUndo(message, callback) {
    var existing = document.querySelector('.fp-undo-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'fp-undo-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = '<span></span><button type="button">Undo</button>';
    toast.querySelector('span').textContent = message;
    var timer = global.setTimeout(function () { if (toast.isConnected) toast.remove(); }, 6500);
    toast.querySelector('button').addEventListener('click', async function () {
      global.clearTimeout(timer);
      toast.querySelector('button').disabled = true;
      try { await callback(); toast.querySelector('span').textContent = 'Change undone'; }
      catch (e) { toast.querySelector('span').textContent = 'Could not undo that change'; }
      global.setTimeout(function () { if (toast.isConnected) toast.remove(); }, 1800);
    });
    document.body.appendChild(toast);
  }

  function init() {
    var toast = document.getElementById('toast');
    if (toast) { toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); }
    enhanceClickable(document.body);
    enhanceTabs(document.body);
    enhanceFormLabels(document.body);
    enhanceModals(document.body);
    injectBottomNav();
    injectConfirmDialog();
    document.addEventListener('input', function (event) {
      var overlay = event.target.closest && event.target.closest('[data-fp-guard-dirty]');
      if (overlay && isVisibleModal(overlay)) overlay.setAttribute('data-fp-dirty', 'true');
    });
    document.addEventListener('change', function (event) {
      var overlay = event.target.closest && event.target.closest('[data-fp-guard-dirty]');
      if (overlay && isVisibleModal(overlay)) overlay.setAttribute('data-fp-dirty', 'true');
    });
    document.addEventListener('click', function (event) {
      var tab = event.target.closest && event.target.closest('.tab');
      if (tab) rememberTab(tab);
      setTimeout(function () { setActiveTab(event.target); }, 0);
    });
    document.addEventListener('click', function (event) {
      var overlay = event.target.closest && event.target.closest('[data-fp-guard-dirty]');
      if (!overlay || !modalIsDirty(overlay)) return;
      var close = event.target.closest && event.target.closest('.modal-close, [data-fp-discard-close]');
      var backdrop = event.target === overlay;
      if (!close && !backdrop) return;
      if (overlay.getAttribute('data-fp-discard-approved') === 'true') { overlay.removeAttribute('data-fp-discard-approved'); return; }
      event.preventDefault();
      event.stopImmediatePropagation();
      confirmDiscard(overlay).then(function (discard) {
        if (!discard) return;
        overlay.setAttribute('data-fp-discard-approved', 'true');
        if (close) close.click(); else overlay.click();
      });
    }, true);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        var overlay = visibleModal();
        if (!overlay) return;
        if (overlay.id === 'fp-confirm-dialog') { resolveConfirm(false); return; }
        confirmDiscard(overlay).then(function (discard) { if (discard) performModalClose(overlay); });
      }
      else trapFocus(event);
    });

    global.addEventListener('popstate', function () {
      var overlay = visibleModal();
      if (unwindingHistory) {
        unwindingHistory = false;
        if (!overlay && global.history.state && global.history.state.fpOverlay) {
          unwindingHistory = true;
          global.history.back();
        }
        return;
      }
      if (!overlay) {
        if (global.history.state && global.history.state.fpOverlay) {
          var cleanState = Object.assign({}, global.history.state);
          delete cleanState.fpOverlay;
          global.history.replaceState(cleanState, '');
        }
        return;
      }
      if (overlay.id === 'fp-confirm-dialog') {
        var underlying = underlyingHistoryModal();
        resolveConfirm(false);
        if (underlying) global.history.pushState(Object.assign({}, global.history.state, { fpOverlay: underlying.id }), '');
        else handlingHistoryPop = true;
        return;
      }
      if (modalIsDirty(overlay)) {
        global.history.pushState(Object.assign({}, global.history.state, { fpOverlay: overlay.id }), '');
        confirmDiscard(overlay).then(function (discard) { if (discard) performModalClose(overlay); });
        return;
      }
      handlingHistoryPop = true;
      closeTopModal();
    });

    global.addEventListener('load', function () { global.setTimeout(restoreTabs, 0); });

    var observer = new MutationObserver(function (mutations) {
      var changedShown = [];
      var changedHidden = [];
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 3) { if (node.parentElement) applyProfileToText(node.parentElement); return; }
          if (node.nodeType !== 1) return;
          enhanceClickable(node);
          enhanceTabs(node);
          enhanceFormLabels(node);
          enhanceModals(node);
          applyProfileToText(node);
        });
        if (mutation.type === 'attributes' && mutation.target.classList && mutation.target.classList.contains('modal-overlay')) {
          var isHidden = global.getComputedStyle(mutation.target).display === 'none';
          var wasHidden = mutation.target.getAttribute('aria-hidden') === 'true';
          mutation.target.setAttribute('aria-hidden', isHidden ? 'true' : 'false');
          if (!isHidden && wasHidden) {
            changedShown.push(mutation.target.id);
            mutation.target.setAttribute('data-fp-dirty', 'false');
            lastModalTrigger = document.activeElement;
            var focusTarget = mutation.target.querySelector('.modal-close, button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])');
            if (focusTarget) global.setTimeout(function () { focusTarget.focus(); }, 0);
          } else if (isHidden && !wasHidden) {
            changedHidden.push(mutation.target.id);
            if (lastModalTrigger && lastModalTrigger.focus) lastModalTrigger.focus();
          }
        }
      });
      if (changedShown.length || changedHidden.length) syncModalHistory(changedShown, changedHidden);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }

  global.FamilyPalUI = {
    init: init,
    profile: profile,
    loadProfile: loadProfile,
    applyProfile: applyProfileToText,
    pronouns: pronouns,
    confirm: confirmAction,
    setBusy: setBusy,
    runBusy: runBusy,
    offerUndo: offerUndo,
    markSaved: markSaved,
    openMore: openMoreSheet,
    closeMore: closeMoreSheet
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window, document);
