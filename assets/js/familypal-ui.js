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

  function pronouns() {
    if (profile.babyPronouns === 'he') return { subject: 'he', Subject: 'He', object: 'him', possessive: 'his' };
    if (profile.babyPronouns === 'they') return { subject: 'they', Subject: 'They', object: 'them', possessive: 'their' };
    return { subject: 'she', Subject: 'She', object: 'her', possessive: 'her' };
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
        if (!parent || /^(SCRIPT|STYLE|TEXTAREA)$/.test(parent.tagName)) return;
        var text = textNode.nodeValue;
        var next = text
          .replace(/Geomé/g, profile.babyName)
          .replace(/Tyron/g, profile.person1Name)
          .replace(/Ansonette/g, profile.person2Name);
        if (document.body && document.body.dataset.app === 'baby') {
          next = next.replace(/\bShe\b/g, p.Subject).replace(/\bshe\b/g, p.subject);
        }
        if (next !== text) textNode.nodeValue = next;
      });
      document.querySelectorAll('[data-household-name]').forEach(function (el) { el.textContent = profile.householdName; });
      document.querySelectorAll('[data-baby-name]').forEach(function (el) { el.textContent = profile.babyName; });
      document.querySelectorAll('[data-person-1]').forEach(function (el) { el.textContent = profile.person1Name; });
      document.querySelectorAll('[data-person-2]').forEach(function (el) { el.textContent = profile.person2Name; });
      document.querySelectorAll('[placeholder]').forEach(function (el) {
        var value = el.getAttribute('placeholder') || '';
        el.setAttribute('placeholder', value.replace(/Geomé/g, profile.babyName).replace(/Tyron/g, profile.person1Name).replace(/Ansonette/g, profile.person2Name));
      });
      document.title = document.title.replace(/Geomé/g, profile.babyName).replace(/Tyron/g, profile.person1Name).replace(/Ansonette/g, profile.person2Name);
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
      if (el.hasAttribute('data-fp-keyboard')) return;
      el.setAttribute('data-fp-keyboard', 'true');
      el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      el.addEventListener('keydown', function (event) {
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
      tabs.querySelectorAll('.tab').forEach(function (tab) {
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
      });
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
    }).join('') + '<button class="fp-nav-item ' + (app === 'period' || app === 'settings' || app === 'price' ? 'active' : '') + '" type="button" data-fp-more><span class="fp-nav-symbol" aria-hidden="true">•••</span><span>More</span></button>';
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
    overlay.innerHTML = '<div class="modal"><div class="modal-handle"></div><button class="modal-close" type="button" data-fp-close aria-label="Close">×</button><h2>More from FamilyPal</h2><div class="fp-more-grid"><button class="fp-more-action" type="button" data-href="periodpal.html"><strong>PeriodPal</strong><span>Private cycle calendar and health records</span></button><button class="fp-more-action" type="button" data-href="settings.html"><strong>Settings</strong><span>Household, appearance and account</span></button></div></div>';
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
    enhanceModals(document.body);
    injectBottomNav();
    injectConfirmDialog();
    document.addEventListener('click', function (event) { setTimeout(function () { setActiveTab(event.target); }, 0); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); closeTopModal(); }
      else trapFocus(event);
    });

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 3) { if (node.parentElement) applyProfileToText(node.parentElement); return; }
          if (node.nodeType !== 1) return;
          enhanceClickable(node);
          enhanceTabs(node);
          enhanceModals(node);
          applyProfileToText(node);
        });
        if (mutation.type === 'attributes' && mutation.target.classList && mutation.target.classList.contains('modal-overlay')) {
          var isHidden = global.getComputedStyle(mutation.target).display === 'none';
          var wasHidden = mutation.target.getAttribute('aria-hidden') === 'true';
          mutation.target.setAttribute('aria-hidden', isHidden ? 'true' : 'false');
          if (!isHidden && wasHidden) {
            lastModalTrigger = document.activeElement;
            var focusTarget = mutation.target.querySelector('.modal-close, button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])');
            if (focusTarget) global.setTimeout(function () { focusTarget.focus(); }, 0);
          } else if (isHidden && !wasHidden && lastModalTrigger && lastModalTrigger.focus) {
            lastModalTrigger.focus();
          }
        }
      });
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
    offerUndo: offerUndo,
    openMore: openMoreSheet,
    closeMore: closeMoreSheet
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window, document);
