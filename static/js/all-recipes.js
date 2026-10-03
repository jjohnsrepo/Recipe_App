const recipesList = document.getElementById('recipes-list');
const searchInput = document.getElementById('search-input');
const favoritesOnly = document.getElementById('favorites-only');
const typeFilter = document.getElementById('type-filter');
const recipeEmpty = document.getElementById('recipe-empty');
const recipeContent = document.getElementById('recipe-content');
const detailFavoriteBtn = document.getElementById('detail-favorite-btn');
const deleteRecipeBtn = document.getElementById('delete-recipe-btn');
const recipesLayout = document.querySelector('.recipes-layout');
const backToListBtn = document.getElementById('back-to-list');
const folderList = document.getElementById('folder-list');
const createFolderForm = document.getElementById('create-folder-form');
const newFolderName = document.getElementById('new-folder-name');
const folderFormError = document.getElementById('folder-form-error');
const recipeFolderOptions = document.getElementById('recipe-folder-options');
const recipeFolderError = document.getElementById('recipe-folder-error');

let selectedRecipeId = null;
let selectedRecipeTitle = '';
let debounceTimer = null;
let selectedFolderId = null;
let folders = [];
let selectedRecipeFolderIds = [];
let recipeRequestId = 0;

function isMobileLayout() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function showRecipeListView() {
  recipesLayout?.classList.remove('show-detail');
  document.title = 'Your recipes';
}

document.addEventListener('DOMContentLoaded', () => {
  fetchFolders();
  fetchAndDisplayRecipes();

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchAndDisplayRecipes, 300);
  });

  favoritesOnly.addEventListener('change', fetchAndDisplayRecipes);
  typeFilter.addEventListener('change', fetchAndDisplayRecipes);

  detailFavoriteBtn.addEventListener('click', () => {
    if (selectedRecipeId) toggleFavorite(selectedRecipeId);
  });

  deleteRecipeBtn.addEventListener('click', () => {
    if (selectedRecipeId) deleteRecipe(selectedRecipeId, selectedRecipeTitle);
  });

  backToListBtn?.addEventListener('click', showRecipeListView);
  createFolderForm.addEventListener('submit', createFolder);
});

async function fetchFolders() {
  const response = await fetch('/api/folders');
  if (!response.ok) {
    folderFormError.textContent = 'Could not load folders.';
    return;
  }
  folders = await response.json();
  renderFolders();
  renderRecipeFolders();
}

function renderFolders() {
  folderList.replaceChildren();
  const allButton = document.createElement('button');
  allButton.type = 'button';
  allButton.className = `folder-link${selectedFolderId === null ? ' active' : ''}`;
  allButton.textContent = 'All recipes';
  allButton.setAttribute('aria-pressed', selectedFolderId === null);
  allButton.addEventListener('click', () => selectFolder(null));
  folderList.appendChild(allButton);

  folders.forEach((folder) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `folder-link${selectedFolderId === folder.id ? ' active' : ''}`;
    button.setAttribute('aria-pressed', selectedFolderId === folder.id);
    const name = document.createElement('span');
    name.textContent = folder.name;
    const count = document.createElement('span');
    count.className = 'folder-count';
    count.textContent = folder.recipe_count;
    button.append(name, count);
    button.addEventListener('click', () => selectFolder(folder.id));
    folderList.appendChild(button);
  });
}

function selectFolder(folderId) {
  selectedFolderId = folderId;
  renderFolders();
  recipeContent.style.display = 'none';
  recipeEmpty.style.display = 'block';
  selectedRecipeId = null;
  selectedRecipeTitle = '';
  selectedRecipeFolderIds = [];
  showRecipeListView();
  fetchAndDisplayRecipes();
}

async function createFolder(event) {
  event.preventDefault();
  folderFormError.textContent = '';
  const name = newFolderName.value.trim();
  if (!name) return;
  const response = await fetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const result = await response.json();
  if (!response.ok) {
    folderFormError.textContent = result.error || 'Could not create folder.';
    return;
  }
  newFolderName.value = '';
  await fetchFolders();
  selectFolder(result.id);
}

function renderRecipeFolders() {
  recipeFolderOptions.replaceChildren();
  if (folders.length === 0) {
    const message = document.createElement('span');
    message.className = 'muted';
    message.textContent = 'Create a folder in the recipe list to organize this recipe.';
    recipeFolderOptions.appendChild(message);
    return;
  }
  folders.forEach((folder) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedRecipeFolderIds.includes(folder.id);
    checkbox.addEventListener('change', () => updateRecipeFolder(folder.id, checkbox));
    label.append(checkbox, document.createTextNode(folder.name));
    recipeFolderOptions.appendChild(label);
  });
}

async function updateRecipeFolder(folderId, checkbox) {
  const recipeId = selectedRecipeId;
  const adding = checkbox.checked;
  checkbox.disabled = true;
  recipeFolderError.textContent = '';
  try {
    const response = await fetch(`/api/recipes/${recipeId}/folders/${folderId}`, {
      method: adding ? 'PUT' : 'DELETE',
    });
    if (!response.ok) throw new Error('Could not update folder membership.');
    const recipe = await response.json();
    if (selectedRecipeId === recipeId) {
      selectedRecipeFolderIds = recipe.folder_ids;
      renderRecipeFolders();
      if (!adding && selectedFolderId === folderId) {
        await fetchFolders();
        selectFolder(folderId);
      } else {
        await Promise.all([fetchFolders(), fetchAndDisplayRecipes()]);
      }
    }
  } catch (error) {
    checkbox.checked = !adding;
    checkbox.disabled = false;
    recipeFolderError.textContent = error.message;
  }
}

function buildApiUrl() {
  const params = new URLSearchParams();
  const query = searchInput.value.trim();
  if (query) params.set('q', query);
  if (favoritesOnly.checked) params.set('favorite', '1');
  if (typeFilter.value) params.set('type', typeFilter.value);
  if (selectedFolderId !== null) params.set('folder', selectedFolderId);
  const qs = params.toString();
  return qs ? `/api/recipes?${qs}` : '/api/recipes';
}

async function fetchAndDisplayRecipes() {
  const requestId = ++recipeRequestId;
  const response = await fetch(buildApiUrl());
  if (!response.ok) return;
  const data = await response.json();
  if (requestId !== recipeRequestId) return;
  recipesList.innerHTML = '';

  if (data.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'list-empty';
    empty.textContent = 'No recipes found';
    recipesList.appendChild(empty);
    return;
  }

  data.forEach((recipe) => {
    const li = document.createElement('li');
    li.dataset.recipeId = recipe.id;
    if (recipe.id === selectedRecipeId) li.classList.add('active');

    const starBtn = document.createElement('button');
    starBtn.className = 'list-favorite-btn';
    starBtn.type = 'button';
    starBtn.setAttribute('aria-label', 'Toggle favorite');
    starBtn.textContent = recipe.is_favorite ? '★' : '☆';
    if (recipe.is_favorite) starBtn.classList.add('favorited');
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(recipe.id);
    });

    const selectBtn = document.createElement('button');
    selectBtn.className = 'recipe-select-btn';
    selectBtn.type = 'button';
    selectBtn.innerHTML = `
      <span class="recipe-item-title">${escapeHtml(recipe.title)}</span>
      <span class="recipe-item-meta">${escapeHtml(recipe.type || '')}</span>
    `;
    selectBtn.addEventListener('click', () => showRecipeDetail(recipe));

    li.appendChild(starBtn);
    li.appendChild(selectBtn);
    recipesList.appendChild(li);
  });
}

async function toggleFavorite(recipeId) {
  const response = await fetch(`/api/recipes/${recipeId}/favorite`, { method: 'PATCH' });
  if (!response.ok) return;

  const { is_favorite } = await response.json();

  if (selectedRecipeId === recipeId) {
    updateFavoriteButton(is_favorite);
  }

  await fetchAndDisplayRecipes();
}

function showRecipeDetail(recipe) {
  selectedRecipeId = recipe.id;
  selectedRecipeTitle = recipe.title || 'this recipe';
  selectedRecipeFolderIds = recipe.folder_ids || [];
  recipeFolderError.textContent = '';
  renderRecipeFolders();

  document.querySelectorAll('.recipes-list li').forEach((li) => li.classList.remove('active'));
  const activeLi = document.querySelector(`.recipes-list li[data-recipe-id="${recipe.id}"]`);
  if (activeLi) activeLi.classList.add('active');

  recipeEmpty.style.display = 'none';
  recipeContent.style.display = 'block';

  document.querySelector('.recipe-detail').scrollTop = 0;

  document.getElementById('type').textContent = recipe.type || '';
  document.getElementById('title').textContent = recipe.title || '';
  document.getElementById('prep-time').textContent = recipe.prep_time || 'N/A';
  document.getElementById('cook-time').textContent = recipe.cook_time || 'N/A';
  document.getElementById('servings').textContent = recipe.servings ?? 'N/A';

  populateList('ingredients', recipe.ingredients);
  populateList('instructions', recipe.instructions, true);
  populateList('additional-notes', recipe.additional_notes);

  const sourceEl = document.getElementById('source');
  if (recipe.source) {
    sourceEl.innerHTML = `Source: <a href="${escapeHtml(recipe.source)}" target="_blank" rel="noopener">${escapeHtml(recipe.source)}</a>`;
  } else {
    sourceEl.textContent = '';
  }

  const langEl = document.getElementById('language');
  langEl.textContent = recipe.language ? `Language: ${recipe.language}` : '';

  updateFavoriteButton(recipe.is_favorite);

  if (isMobileLayout()) {
    recipesLayout?.classList.add('show-detail');
    document.title = recipe.title || 'Recipe';
  }
}

async function deleteRecipe(recipeId, title) {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;

  const response = await fetch(`/api/recipes/${recipeId}`, { method: 'DELETE' });
  if (!response.ok) {
    alert('Failed to delete recipe.');
    return;
  }

  selectedRecipeId = null;
  selectedRecipeTitle = '';
  recipeContent.style.display = 'none';
  recipeEmpty.style.display = 'block';
  showRecipeListView();
  await Promise.all([fetchFolders(), fetchAndDisplayRecipes()]);
}

function updateFavoriteButton(isFavorite) {
  detailFavoriteBtn.textContent = isFavorite ? '★' : '☆';
  detailFavoriteBtn.classList.toggle('favorited', isFavorite);
}

function populateList(elementId, items, ordered = false) {
  const el = document.getElementById(elementId);
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
