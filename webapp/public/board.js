(() => {
  const board = document.getElementById('board');
  if (!board) return;

  const itemsUrl = board.dataset.itemsUrl;
  const columns = Array.from(board.querySelectorAll('.column'));
  const statuses = columns.map((column) => column.dataset.status);
  const labels = Object.fromEntries(columns.map((column) => [column.dataset.status, column.dataset.label]));
  const authorInput = document.getElementById('author');
  const toast = document.querySelector('.toast');
  const authorKey = 'kanbot:author';

  const icon = (path) =>
    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const icons = {
    left: icon('<path d="M12.5 15 7.5 10l5-5"/>'),
    right: icon('<path d="m7.5 15 5-5-5-5"/>'),
    delete: icon('<path d="M3.5 5.5h13M8 5.5V4h4v1.5M5.5 5.5l.75 10.5h7.5l.75-10.5M8.5 9v4M11.5 9v4"/>'),
  };

  let state = JSON.parse(board.dataset.board);
  let queue = Promise.resolve();
  let pending = 0;
  let edits = 0;
  let dragging = false;
  let renderAfterDrag = false;
  let toastTimer;

  function render() {
    if (dragging) {
      renderAfterDrag = true;
      return;
    }
    renderAfterDrag = false;

    for (const column of state.columns) {
      const section = columns[statuses.indexOf(column.status)];
      const cards = column.items.map((item, index) => cardElement(item, index, column.status));
      section.querySelector('.cards').replaceChildren(...cards);
      section.querySelector('[data-count]').textContent = column.items.length;
    }
  }

  function cardElement(item, index, status) {
    const card = document.createElement('li');
    card.className = 'card';
    card.dataset.itemId = item.id;

    const text = document.createElement('p');
    text.className = 'card-text';
    text.textContent = item.description;

    const number = document.createElement('span');
    number.className = 'card-number';
    number.textContent = `#${index + 1}`;

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const previous = statuses[statuses.indexOf(status) - 1];
    const next = statuses[statuses.indexOf(status) + 1];
    if (previous) actions.append(actionButton('move', `Move to ${labels[previous]}`, icons.left, previous));
    if (next) actions.append(actionButton('move', `Move to ${labels[next]}`, icons.right, next));
    actions.append(actionButton('delete', 'Delete card', icons.delete));

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.append(number, actions);

    card.append(text, footer);
    return card;
  }

  function actionButton(action, label, iconMarkup, status) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card-action';
    button.dataset.action = action;
    if (status) button.dataset.status = status;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = iconMarkup;
    return button;
  }

  async function api(method, url, body) {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error("Couldn't reach Kanbot. Check your connection and try again.");
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  // Changes are sent one at a time so the server applies them in the order they were made.
  function send(method, url, body) {
    pending += 1;
    edits += 1;
    queue = queue
      .then(() => api(method, url, body))
      .then(
        (data) => settle(data),
        (error) => {
          showError(error.message);
          return settle(null);
        }
      );
    return queue;
  }

  function settle(data) {
    pending -= 1;
    if (pending === 0) {
      if (data) {
        state = data;
        render();
      } else {
        refresh();
      }
    }
    return Boolean(data);
  }

  async function refresh() {
    if (document.hidden || dragging || pending > 0) return;

    const editsBefore = edits;
    try {
      const data = await api('GET', itemsUrl);
      if (dragging || pending > 0 || edits !== editsBefore) return;
      if (JSON.stringify(data) !== JSON.stringify(state)) {
        state = data;
        render();
      }
    } catch {
      // The next poll tries again.
    }
  }

  function moveLocally(itemId, status, beforeId) {
    let moved;
    for (const column of state.columns) {
      const index = column.items.findIndex((item) => item.id === itemId);
      if (index !== -1) [moved] = column.items.splice(index, 1);
    }
    if (!moved) return;

    const target = state.columns.find((column) => column.status === status);
    const beforeIndex = target.items.findIndex((item) => item.id === beforeId);
    target.items.splice(beforeIndex === -1 ? target.items.length : beforeIndex, 0, moved);
  }

  function moveItem(itemId, status, beforeId = null) {
    moveLocally(itemId, status, beforeId);
    render();
    send('PATCH', `${itemsUrl}/${itemId}`, { status, before_id: beforeId });
  }

  function deleteItem(itemId) {
    for (const column of state.columns) {
      column.items = column.items.filter((item) => item.id !== itemId);
    }
    render();
    send('DELETE', `${itemsUrl}/${itemId}`);
  }

  function showError(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 5000);
  }

  board.addEventListener('click', (event) => {
    const button = event.target.closest('.card-action');
    if (!button) return;

    const card = button.closest('.card');
    const itemId = Number(card.dataset.itemId);

    if (button.dataset.action === 'move') {
      moveItem(itemId, button.dataset.status);
    } else if (window.confirm(`Delete "${card.querySelector('.card-text').textContent}"?`)) {
      deleteItem(itemId);
    }
  });

  board.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const input = form.elements.description;
    const description = input.value.trim();
    if (!description) return;

    input.value = '';
    const added = await send('POST', itemsUrl, {
      status: form.dataset.status,
      description,
      author: authorInput.value.trim(),
    });
    if (!added && !input.value) input.value = description;
  });

  authorInput.value = localStorage.getItem(authorKey) || '';
  authorInput.addEventListener('input', () => localStorage.setItem(authorKey, authorInput.value.trim()));

  if (window.Sortable) {
    for (const list of board.querySelectorAll('.cards')) {
      Sortable.create(list, {
        group: 'cards',
        draggable: '.card',
        filter: '.card-action',
        preventOnFilter: false,
        forceFallback: true,
        fallbackOnBody: true,
        fallbackTolerance: 3,
        animation: 150,
        delay: 150,
        delayOnTouchOnly: true,
        ghostClass: 'card-ghost',
        chosenClass: 'card-chosen',
        dragClass: 'card-drag',
        onStart() {
          dragging = true;
        },
        onEnd(event) {
          dragging = false;
          if (event.from === event.to && event.oldIndex === event.newIndex) {
            if (renderAfterDrag) render();
            return;
          }

          const next = event.item.nextElementSibling;
          moveItem(Number(event.item.dataset.itemId), event.to.dataset.status, next ? Number(next.dataset.itemId) : null);
        },
      });
    }
  }

  render();
  setInterval(refresh, 15000);
  document.addEventListener('visibilitychange', refresh);
})();
