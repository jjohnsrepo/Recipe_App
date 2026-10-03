document.addEventListener('DOMContentLoaded', () => {
  populateRecipeFromStorage();
});

let currentRecipeId = null;
let currentRecipeFolderIds = [];
let folders = [];

function populateRecipeFromStorage() {
  const raw = window.sessionStorage.getItem('recipe');
  if (!raw) return;

  let recipe;
  try {
    recipe = JSON.parse(raw);
  } catch {
    return;
  }

  currentRecipeId = recipe.id || null;

  const scalarFields = {
    type: 'type',
    title: 'title',
    prep_time: 'prep-time',
    cook_time: 'cook-time',
    servings: 'servings',
    language: 'language',
  };

  Object.entries(scalarFields).forEach(([key, elementId]) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    const value = recipe[key];
    if (key === 'language' && value) {
      el.textContent = `Language: ${value}`;
    } else {
      el.textContent = value ?? (key.includes('time') ? 'N/A' : '');
    }
  });

  populateList('ingredients', recipe.ingredients);
  populateList('instructions', recipe.instructions);
  populateList('additional-notes', recipe.additional_notes);

  const sourceEl = document.getElementById('source');
  if (recipe.source) {
    sourceEl.innerHTML = `Source: <a href="${escapeHtml(recipe.source)}" target="_blank" rel="noopener">${escapeHtml(recipe.source)}</a>`;
  }

  if (currentRecipeId) {
    const favBtn = document.getElementById('favorite-btn');
    favBtn.style.display = 'inline-block';
    updateFavoriteButton(recipe.is_favorite);
    favBtn.addEventListener('click', toggleFavorite);

    const deleteBtn = document.getElementById('delete-recipe-btn');
    deleteBtn.style.display = 'inline-block';
    deleteBtn.addEventListener('click', () => deleteRecipe(recipe.title));

    currentRecipeFolderIds = recipe.folder_ids || [];
    document.getElementById('recipe-folders').hidden = false;
    document.getElementById('create-folder-form').addEventListener('submit', createAndAddFolder);
    loadFolders();
  }

  window.sessionStorage.removeItem('recipe');
}

async function loadFolders() {
  const error = document.getElementById('recipe-folder-error');
  try {
    const response = await fetch('/api/folders');
    if (!response.ok) throw new Error('Could not load folders.');
    folders = await response.json();
    renderRecipeFolders();
  } catch {
    error.textContent = 'Could not load folders.';
  }
}

function renderRecipeFolders() {
  const options = document.getElementById('recipe-folder-options');
  options.replaceChildren();

  if (folders.length === 0) {
    const message = document.createElement('span');
    message.className = 'muted';
    message.textContent = 'No folders yet. Create one below.';
    options.appendChild(message);
    return;
  }

  folders.forEach((folder) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = currentRecipeFolderIds.includes(folder.id);
    checkbox.addEventListener('change', async () => {
      const adding = checkbox.checked;
      checkbox.disabled = true;
      document.getElementById('recipe-folder-error').textContent = '';
      try {
        await setRecipeFolderMembership(folder.id, adding);
      } catch (error) {
        checkbox.checked = !adding;
        checkbox.disabled = false;
        document.getElementById('recipe-folder-error').textContent = error.message;
      }
    });
    label.append(checkbox, document.createTextNode(folder.name));
    options.appendChild(label);
  });
}

async function setRecipeFolderMembership(folderId, adding) {
  const response = await fetch(`/api/recipes/${currentRecipeId}/folders/${folderId}`, {
    method: adding ? 'PUT' : 'DELETE',
  });
  if (!response.ok) throw new Error('Could not update folder membership.');
  const recipe = await response.json();
  currentRecipeFolderIds = recipe.folder_ids || [];
  renderRecipeFolders();
}

async function createAndAddFolder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = document.getElementById('new-folder-name');
  const button = form.querySelector('button');
  const error = document.getElementById('recipe-folder-error');
  const name = input.value.trim();
  if (!name) return;

  error.textContent = '';
  button.disabled = true;
  try {
    const response = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const folder = await response.json();
    if (!response.ok) throw new Error(folder.error || 'Could not create folder.');
    folders.push(folder);
    folders.sort((a, b) => a.name.localeCompare(b.name));
    renderRecipeFolders();
    await setRecipeFolderMembership(folder.id, true);
    input.value = '';
  } catch (cause) {
    error.textContent = cause.message;
  } finally {
    button.disabled = false;
  }
}

async function toggleFavorite() {
  if (!currentRecipeId) return;
  const response = await fetch(`/api/recipes/${currentRecipeId}/favorite`, { method: 'PATCH' });
  if (!response.ok) return;
  const { is_favorite } = await response.json();
  updateFavoriteButton(is_favorite);
}

function updateFavoriteButton(isFavorite) {
  const favBtn = document.getElementById('favorite-btn');
  favBtn.textContent = isFavorite ? '★' : '☆';
  favBtn.classList.toggle('favorited', isFavorite);
}

async function deleteRecipe(title) {
  if (!currentRecipeId) return;
  if (!confirm(`Delete "${title || 'this recipe'}"? This cannot be undone.`)) return;

  const response = await fetch(`/api/recipes/${currentRecipeId}`, { method: 'DELETE' });
  if (!response.ok) {
    alert('Failed to delete recipe.');
    return;
  }

  window.location.href = '/all-recipes';
}

function populateList(elementId, items) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = '';
  if (!items || items.length === 0) return;
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    el.appendChild(li);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
