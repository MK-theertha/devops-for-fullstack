const list = document.getElementById('notes');
const form = document.getElementById('note-form');
const input = document.getElementById('note-body');
const errorEl = document.getElementById('error');

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const ref = res.headers.get('x-request-id');
    throw new Error(`${data.error ?? res.statusText}${ref ? ` (ref ${ref})` : ''}`);
  }
  return data;
}

function render(notes) {
  list.replaceChildren(
    ...notes.map((note) => {
      const li = document.createElement('li');
      const time = document.createElement('time');
      time.dateTime = note.created_at;
      time.textContent = new Date(note.created_at).toLocaleString();
      li.append(note.body, time);
      return li;
    }),
  );
}

async function refresh() {
  try {
    render(await api('/api/notes'));
    showError('');
  } catch (err) {
    showError(`Could not load notes: ${err.message}`);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/notes', { method: 'POST', body: JSON.stringify({ body: input.value }) });
    input.value = '';
    await refresh();
  } catch (err) {
    showError(`Could not save note: ${err.message}`);
  }
});

api('/api/health')
  .then(({ version }) => { document.getElementById('version').textContent = version.slice(0, 7); })
  .catch(() => {});

refresh();
