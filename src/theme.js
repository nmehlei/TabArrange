// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 nmehlei
(() => {
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try { preference = localStorage.getItem('theme') || 'system'; } catch {}
  const apply = () => {
    document.documentElement.dataset.theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
  };
  if (!['system', 'light', 'dark'].includes(preference)) preference = 'system';
  apply(); system.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.querySelector('#theme'); select.value = preference;
    select.addEventListener('change', () => {
      preference = select.value;
      try { localStorage.setItem('theme', preference); } catch {}
      apply();
    });
  });
})();
