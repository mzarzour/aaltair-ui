(async () => {
  const statusUrl = '/api/refresh';
  const response = await fetch(statusUrl, {cache: 'no-store'});
  if (!response.ok) return;
  let state = await response.json();
  const displayedAt = document.querySelector('#brief-asof time[datetime]')?.dateTime || state.completedAt;
  const controls = [];
  let timer, submitting = false, revision = 0;

  function render() {
    const busy = state.status === 'queued' || state.status === 'running';
    const time = Date.parse(state.requestedAt);
    const queuedAt = Number.isFinite(time) ? new Date(time).toLocaleString('en-US', {
      timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    }) : '';
    for (const {button, label} of controls) {
      button.disabled = busy || submitting;
      button.textContent = state.status === 'running' ? 'Refreshing…' : state.status === 'queued' ? 'Refresh queued' : 'Refresh Now';
      if (state.status === 'queued') {
        label.textContent = 'Requested' + (queuedAt ? ' · ' + queuedAt : '') + '. Waiting for a GitHub runner. ';
        const link = document.createElement('a');
        link.href = 'https://github.com/mzarzour/aaltair-ui/actions/workflows/refresh-apiiro.yml';
        link.textContent = 'Open workflow';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        label.append(link, ' and choose Run workflow to start it manually.');
      }
      else if (state.status === 'running') label.textContent = 'Fetching the next Apiiro snapshot.';
      else if (state.status === 'failed') label.textContent = state.error || 'Refresh failed. Previous snapshot retained.';
      else label.textContent = '';
    }
    clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(poll, busy ? 15000 : 60000);
  }
  function update() {
    if (state.completedAt && (!displayedAt || Date.parse(state.completedAt) > Date.parse(displayedAt))) {
      location.reload();
      return;
    }
    render();
  }
  async function poll() {
    if (submitting || document.hidden) return;
    const request = ++revision;
    try {
      const result = await fetch(statusUrl, {cache: 'no-store'});
      if (!result.ok) throw Error();
      const latest = await result.json();
      if (request !== revision) return;
      state = latest;
      update();
    } catch {
      if (request === revision) render();
    }
  }
  async function queue() {
    if (submitting) return;
    submitting = true;
    ++revision;
    render();
    try {
      const result = await fetch(statusUrl, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
      const latest = await result.json();
      if (!result.ok) throw Error(latest.error || 'Unable to queue refresh');
      state = latest;
    } catch (error) {
      submitting = false;
      render();
      for (const {label} of controls) label.textContent = error.message;
      return;
    }
    submitting = false;
    update();
  }
  for (const host of document.querySelectorAll('#home-page > .heading, #setup-page > .heading')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    button.onclick = queue;
    const label = document.createElement('span');
    label.className = 'small';
    label.setAttribute('role', 'status');
    host.append(button, label);
    controls.push({button, label});
  }
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (!document.hidden) poll();
  });
  update();
})().catch(() => {});
