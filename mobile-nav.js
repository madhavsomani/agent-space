function syncMobileNav(tab) {
  document.querySelectorAll('#mobile-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
}
// Keep mobile nav in sync when desktop nav is used
const _origSwitchTab = switchTab;
switchTab = function(t) { _origSwitchTab(t); syncMobileNav(t); };
// Sync on load
(function(){ const h=location.hash.replace('#',''); if(h) syncMobileNav(h); })();

// ===== PULL-TO-REFRESH (mobile) =====
(function() {
  const THRESHOLD = 80;
  const indicator = document.getElementById('ptr-indicator');
  const arrow = document.getElementById('ptr-arrow');
  const spinner = document.getElementById('ptr-spinner');
  const text = document.getElementById('ptr-text');
  let startY = 0, pullDist = 0, pulling = false, refreshing = false;

  function isMobile() { return window.innerWidth <= 768; }
  function atTop() { return window.scrollY <= 5; }

  document.addEventListener('touchstart', function(e) {
    if (!isMobile() || refreshing || !atTop()) return;
    startY = e.touches[0].clientY;
    pulling = true;
    pullDist = 0;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!pulling || refreshing) return;
    const y = e.touches[0].clientY;
    pullDist = Math.max(0, (y - startY) * 0.5);
    if (pullDist < 10) return;
    indicator.classList.add('visible');
    const t = Math.min(pullDist, THRESHOLD + 20);
    indicator.style.transform = `translateX(-50%) translateY(${t - 60}px)`;
    arrow.style.display = '';
    spinner.style.display = 'none';
    if (pullDist >= THRESHOLD) {
      arrow.classList.add('flipped');
      text.textContent = 'Release to refresh';
    } else {
      arrow.classList.remove('flipped');
      text.textContent = 'Pull to refresh';
    }
  }, { passive: true });

  document.addEventListener('touchend', function() {
    if (!pulling) return;
    pulling = false;
    if (pullDist >= THRESHOLD && !refreshing) {
      refreshing = true;
      arrow.style.display = 'none';
      spinner.style.display = '';
      spinner.classList.add('spinning');
      text.textContent = 'Refreshing…';
      indicator.style.transform = 'translateX(-50%) translateY(0px)';
      (typeof refreshAll === 'function' ? refreshAll() : Promise.resolve()).finally(() => {
        setTimeout(() => {
          refreshing = false;
          spinner.classList.remove('spinning');
          text.textContent = 'Done!';
          setTimeout(() => {
            indicator.classList.remove('visible');
            indicator.style.transform = 'translateX(-50%) translateY(-60px)';
          }, 400);
        }, 600);
      });
    } else {
      indicator.classList.remove('visible');
      indicator.style.transform = 'translateX(-50%) translateY(-60px)';
    }
  }, { passive: true });
})();

// ===== MOBILE COLLAPSIBLE CARDS =====
// On mobile, make card h3 headers clickable to collapse/expand content
(function() {
  const STORAGE_KEY = 'hq-collapsed-cards';
  function isMobile() { return window.innerWidth <= 768; }

  function getCollapsed() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } }
  function setCollapsed(c) { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); }

  // Target specific heavy panels on Office tab (timeline, uptime, heatmap, logs)
  const collapsibleIds = ['agent-timeline','agent-uptime','heatmap-calendar','live-logs-panel'];

  function setupCollapsible() {
    if (!isMobile()) return;
    const collapsed = getCollapsed();
    collapsibleIds.forEach(id => {
      const card = document.getElementById(id);
      if (!card || card.dataset.collapsibleSetup) return;
      card.dataset.collapsibleSetup = '1';
      const h3 = card.querySelector('h3');
      if (!h3) return;
      // Create toggle arrow
      const arrow = document.createElement('span');
      arrow.className = 'collapse-arrow';
      arrow.style.cssText = 'font-size:10px;margin-left:6px;transition:transform .2s;display:inline-block;cursor:pointer';
      arrow.textContent = '▼';
      h3.appendChild(arrow);
      h3.style.cursor = 'pointer';
      h3.style.userSelect = 'none';

      // Wrap content after h3
      const wrapper = document.createElement('div');
      wrapper.className = 'collapsible-body';
      const children = Array.from(card.children).filter(c => c !== h3);
      children.forEach(c => wrapper.appendChild(c));
      card.appendChild(wrapper);

      // Apply saved state
      if (collapsed[id]) {
        wrapper.style.display = 'none';
        arrow.style.transform = 'rotate(-90deg)';
      }

      h3.addEventListener('click', () => {
        const isHidden = wrapper.style.display === 'none';
        wrapper.style.display = isHidden ? '' : 'none';
        arrow.style.transform = isHidden ? '' : 'rotate(-90deg)';
        const c = getCollapsed();
        c[id] = !isHidden;
        setCollapsed(c);
      });
    });
  }

  // Run on load and after DOM changes via MutationObserver (replaces wasteful 3s interval)
  setupCollapsible();
  const _collObs = new MutationObserver(() => setupCollapsible());
  _collObs.observe(document.body, { childList: true, subtree: true });
})();
