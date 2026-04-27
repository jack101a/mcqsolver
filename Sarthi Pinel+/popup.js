function fmt(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function render() {
  const listEl = document.getElementById('notifList');
  chrome.storage.local.get(['notifications'], res => {
    const items = res.notifications || [];
    if (!items.length) {
      listEl.innerHTML = `<div class="item"><div class="txt">No notifications</div></div>`;
      return;
    }
    listEl.innerHTML = items.map(it => `
      <div class="item">
        <div class="txt">${escapeHtml(it.text)}</div>
        <div class="ts">${fmt(it.ts)}</div>
      </div>
    `).join('');
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

document.getElementById('clearBtn').addEventListener('click', () => {
  chrome.storage.local.set({ notifications: [] }, render);
});

render();