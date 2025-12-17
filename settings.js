// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const THEME_KEY = 'theme_preference';

document.getElementById('save-btn').addEventListener('click', function() {
  const theme = document.querySelector('input[name="theme"]:checked').value;
  localStorage.setItem(THEME_KEY, theme);
  document.getElementById('saved-value').textContent = 'Saved: ' + theme;
});

const savedTheme = localStorage.getItem(THEME_KEY);
if (savedTheme) {
  document.querySelector('input[value="' + savedTheme + '"]').checked = true;
  document.getElementById('saved-value').textContent = 'Saved: ' + savedTheme;
}
