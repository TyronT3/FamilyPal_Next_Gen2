(function (global, document) {
  var storageKey = 'fp_theme';
  var root = document.documentElement;

  function preferredTheme() {
    var saved = localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') return saved;
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    updateButtons(theme);
  }

  function updateButtons(theme) {
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    buttons.forEach(function (button) {
      var next = theme === 'light' ? 'dark' : 'light';
      button.textContent = '◐';
      button.setAttribute('aria-label', 'Switch to ' + next + ' mode');
      button.setAttribute('title', 'Switch to ' + next + ' mode');
    });
  }

  function setTheme(theme) {
    localStorage.setItem(storageKey, theme);
    applyTheme(theme);
  }

  function toggleTheme() {
    setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  }

  global.FamilyPalTheme = {
    applyTheme: applyTheme,
    setTheme: setTheme,
    toggleTheme: toggleTheme
  };

  applyTheme(preferredTheme());
  document.addEventListener('DOMContentLoaded', function () {
    updateButtons(root.getAttribute('data-theme') || preferredTheme());
  });
})(window, document);
