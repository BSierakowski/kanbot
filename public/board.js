(() => {
  const board = document.getElementById('board');
  const token = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const boardUrl = `/api/boards?token=${encodeURIComponent(token)}`;
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

  let state;
  let columns = [];
  let statuses = [];
  let queue = Promise.resolve();
  let pending = 0;
  let edits = 0;
  let dragging = false;
  let renderAfterDrag = false;
  let toastTimer;

  const label = (status) => status.charAt(0).toUpperCase() + status.slice(1);
  const cardUrl = (id) => `${boardUrl}&card=${id}`;

  function columnElement({ status, title }) {
    const section = document.createElement('section');
    section.className = 'column';
    section.dataset.status = status;

    const heading = document.createElement('h2');
    heading.textContent = title;
    const count = document.createElement('span');
    count.className = 'count';
    const header = document.createElement('header');
    header.className = 'column-header';
    header.append(heading, count);

    const list = document.createElement('ol');
    list.className = 'cards';
    list.dataset.status = status;

    const input = document.createElement('input');
    input.name = 'description';
    input.type = 'text';
    input.maxLength = 1900;
    input.placeholder = 'Add a card';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', `Add a card to ${label(status)}`);
    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Add';
    const form = document.createElement('form');
    form.className = 'add-card';
    form.dataset.status = status;
    form.append(input, button);

    section.append(header, list, form);
    return section;
  }

  function render() {
    if (dragging) {
      renderAfterDrag = true;
      return;
    }
    renderAfterDrag = false;

    state.columns.forEach((column, index) => {
      const section = columns[index];
      const cards = column.cards.map((card, position) => cardElement(card, position, column.status));
      section.querySelector('.cards').replaceChildren(...cards);
      section.querySelector('.count').textContent = column.cards.length;
    });
  }

  function cardElement(card, index, status) {
    const item = document.createElement('li');
    item.className = 'card';
    item.dataset.cardId = card.id;

    const text = document.createElement('p');
    text.className = 'card-text';
    text.textContent = card.description;

    const meta = document.createElement('span');
    meta.className = 'card-meta';
    meta.textContent = card.author ? `#${index + 1} · ${card.author}` : `#${index + 1}`;

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const previous = statuses[statuses.indexOf(status) - 1];
    const next = statuses[statuses.indexOf(status) + 1];
    if (previous) actions.append(actionButton('move', `Move to ${label(previous)}`, icons.left, previous));
    if (next) actions.append(actionButton('move', `Move to ${label(next)}`, icons.right, next));
    actions.append(actionButton('delete', 'Delete card', icons.delete));

    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.append(meta, actions);

    item.append(text, footer);
    return item;
  }

  function actionButton(action, buttonLabel, iconMarkup, status) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card-action';
    button.dataset.action = action;
    if (status) button.dataset.status = status;
    button.title = buttonLabel;
    button.setAttribute('aria-label', buttonLabel);
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
    if (!response.ok) {
      const error = new Error(data.error || 'Something went wrong. Please try again.');
      error.status = response.status;
      throw error;
    }
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
      const data = await api('GET', boardUrl);
      if (dragging || pending > 0 || edits !== editsBefore) return;
      if (JSON.stringify(data) !== JSON.stringify(state)) {
        state = data;
        render();
      }
    } catch {
      // The next poll tries again.
    }
  }

  function moveLocally(cardId, status, beforeId) {
    let moved;
    for (const column of state.columns) {
      const index = column.cards.findIndex((card) => card.id === cardId);
      if (index !== -1) [moved] = column.cards.splice(index, 1);
    }
    if (!moved) return;

    const target = state.columns.find((column) => column.status === status);
    const beforeIndex = target.cards.findIndex((card) => card.id === beforeId);
    target.cards.splice(beforeIndex === -1 ? target.cards.length : beforeIndex, 0, moved);
  }

  function moveCard(cardId, status, beforeId = null) {
    moveLocally(cardId, status, beforeId);
    render();
    send('PATCH', cardUrl(cardId), { status, before_id: beforeId });
  }

  function deleteCard(cardId) {
    for (const column of state.columns) {
      column.cards = column.cards.filter((card) => card.id !== cardId);
    }
    render();
    send('DELETE', cardUrl(cardId));
  }

  function showError(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 5000);
  }

  function showNotFound() {
    document.title = 'Board not found · Kanbot';
    for (const element of document.querySelectorAll('.topbar, .board, .hint')) element.hidden = true;
    document.getElementById('not-found').hidden = false;
  }

  function enableDragging() {
    if (!window.Sortable) return;

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
          moveCard(Number(event.item.dataset.cardId), event.to.dataset.status, next ? Number(next.dataset.cardId) : null);
        },
      });
    }
  }

  board.addEventListener('click', (event) => {
    const button = event.target.closest('.card-action');
    if (!button) return;

    const card = button.closest('.card');
    const cardId = Number(card.dataset.cardId);

    if (button.dataset.action === 'move') {
      moveCard(cardId, button.dataset.status);
    } else if (window.confirm(`Delete "${card.querySelector('.card-text').textContent}"?`)) {
      deleteCard(cardId);
    }
  });

  board.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const input = form.elements.description;
    const description = input.value.trim();
    if (!description) return;

    input.value = '';
    const added = await send('POST', boardUrl, {
      status: form.dataset.status,
      description,
      author: authorInput.value.trim(),
    });
    if (!added && !input.value) input.value = description;
  });

  authorInput.value = localStorage.getItem(authorKey) || '';
  authorInput.addEventListener('input', () => localStorage.setItem(authorKey, authorInput.value.trim()));

  async function load() {
    try {
      state = await api('GET', boardUrl);
    } catch (error) {
      if (error.status === 404) showNotFound();
      else showError(error.message);
      return;
    }

    const name = state.name ? `#${state.name.replace(/^#/, '')}` : 'Discord channel';
    document.title = `${name} · Kanbot`;
    document.getElementById('board-name').textContent = name;

    statuses = state.columns.map((column) => column.status);
    columns = state.columns.map(columnElement);
    board.replaceChildren(...columns);
    render();
    enableDragging();

    setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
  }

  load();
})();
