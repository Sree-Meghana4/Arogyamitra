const themeToggle = document.getElementById('theme-toggle');
const themeToggleIcon = document.getElementById('theme-toggle-icon');

function getPreferredTheme() {
  if (localStorage.getItem('theme')) {
    return localStorage.getItem('theme');
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark');
    themeToggleIcon.textContent = '☀️'; // Show sun to indicate you can switch to light
    themeToggle.setAttribute('aria-label', 'Switch to light mode');
  } else {
    document.body.classList.remove('dark');
    themeToggleIcon.textContent = '🌙'; // Show moon to indicate you can switch to dark
    themeToggle.setAttribute('aria-label', 'Switch to dark mode');
  }
  localStorage.setItem('theme', theme);
}

setTheme(getPreferredTheme());

themeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.contains('dark');
  setTheme(isDark ? 'light' : 'dark');
});
