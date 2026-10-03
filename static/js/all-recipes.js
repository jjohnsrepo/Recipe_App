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
const selectedCount = document.getElementById('selected-count');
const clearSelectionBtn = document.getElementById('clear-selection');
const makeShoppingListBtn = document.getElementById('make-shopping-list');
const shoppingListError = document.getElementById('shopping-list-error');
const shoppingListView = document.getElementById('shopping-list-view');
const shoppingListContent = document.getElementById('shopping-list-content');
const shoppingListSummary = document.getElementById('shopping-list-summary');
const copyIngredientsBtn = document.getElementById('copy-ingredients');
const copyStatus = document.getElementById('copy-status');
const mobileLayoutQuery = window.matchMedia('(max-width: 768px)');

let selectedRecipeId = null;
let selectedRecipeTitle = '';
let debounceTimer = null;
let selectedFolderId = null;
let folders = [];
let selectedRecipeFolderIds = [];
let recipeRequestId = 0;
const selectedRecipes = new Map();
let shoppingListText = '';
let shoppingListLoading = false;
let recipeEditor;

function isMobileLayout() {
  return mobileLayoutQuery.matches;
}

function syncResponsiveView() {
  if (mobileLayoutQuery.matches && (!shoppingListView.hidden || recipeContent.style.display === 'block')) {
    recipesLayout?.classList.add('show-detail');
  } else if (!mobileLayoutQuery.matches) {
    recipesLayout?.classList.remove('show-detail');
  }
}

function showRecipeListView() {
  recipesLayout?.classList.remove('show-detail');
  if (!shoppingListView.hidden) {
    shoppingListView.hidden = true;
    recipeContent.style.display = selectedRecipeId ? 'block' : 'none';
    recipeEmpty.style.display = selectedRecipeId ? 'none' : 'block';
  }
  document.title = 'Your recipes';
}

document.addEventListener('DOMContentLoaded', () => {
  recipeEditor = createRecipeEditor(recipeContent, (saved) => {
    if (selectedRecipeId === saved.id) showRecipeDetail(saved);
    if (selectedRecipes.has(saved.id)) selectedRecipes.set(saved.id, saved);
    fetchAndDisplayRecipes().catch(() => {});
  });
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
  clearSelectionBtn.addEventListener('click', clearSelection);
  makeShoppingListBtn.addEventListener('click', showShoppingList);
  copyIngredientsBtn.addEventListener('click', copyIngredients);
  mobileLayoutQuery.addEventListener('change', syncResponsiveView);
});

function updateSelectionActions() {
  const count = selectedRecipes.size;
  selectedCount.textContent = `${count} selected`;
  clearSelectionBtn.disabled = count === 0;
  makeShoppingListBtn.disabled = count === 0 || shoppingListLoading;
}

function clearSelection() {
  selectedRecipes.clear();
  recipesList.querySelectorAll('.list-select-label input').forEach((checkbox) => {
    checkbox.checked = false;
  });
  updateSelectionActions();
}

async function showShoppingList() {
  if (selectedRecipes.size === 0 || shoppingListLoading) return;
  const recipeIds = [...selectedRecipes.keys()];
  shoppingListLoading = true;
  updateSelectionActions();
  makeShoppingListBtn.textContent = 'Combining ingredients…';
  shoppingListError.textContent = '';

  try {
    const response = await fetch('/api/shopping-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_ids: recipeIds }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not make the shopping list.');
    if (typeof result.shopping_list !== 'string') throw new Error('Could not read the shopping list.');

    shoppingListText = result.shopping_list;
    shoppingListContent.textContent = shoppingListText || 'No ingredients listed.';
    shoppingListSummary.textContent = `From ${result.recipe_count} ${result.recipe_count === 1 ? 'recipe' : 'recipes'}`;
    copyStatus.textContent = '';
    copyIngredientsBtn.disabled = shoppingListText.length === 0;

    recipeContent.style.display = 'none';
    recipeEmpty.style.display = 'none';
    shoppingListView.hidden = false;
    document.querySelector('.recipe-detail').scrollTop = 0;
    if (isMobileLayout()) recipesLayout?.classList.add('show-detail');
    document.title = 'Shopping list';
  } catch (error) {
    shoppingListError.textContent = error.message || 'Could not make the shopping list.';
  } finally {
    shoppingListLoading = false;
    makeShoppingListBtn.textContent = 'Make shopping list';
    updateSelectionActions();
  }
}

function copyTextFallback(value) {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function copyIngredients() {
  if (!shoppingListText) return;
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shoppingListText);
      copied = true;
    }
  } catch {
    // Clipboard API can be unavailable on a plain HTTP LAN address.
  }
  if (!copied) copied = copyTextFallback(shoppingListText);
  copyStatus.textContent = copied ? 'Ingredients copied.' : 'Could not copy. Select the ingredients and copy them manually.';
}

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
  shoppingListView.hidden = true;
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
    if (selectedRecipes.has(recipe.id)) selectedRecipes.set(recipe.id, recipe);
    const li = document.createElement('li');
    li.dataset.recipeId = recipe.id;
    if (recipe.id === selectedRecipeId) li.classList.add('active');

    const selectLabel = document.createElement('label');
    selectLabel.className = 'list-select-label';
    const selectCheckbox = document.createElement('input');
    selectCheckbox.type = 'checkbox';
    selectCheckbox.setAttribute('aria-label', `Select ${recipe.title} for shopping list`);
    selectCheckbox.checked = selectedRecipes.has(recipe.id);
    selectCheckbox.addEventListener('change', () => {
      if (selectCheckbox.checked) {
        selectedRecipes.set(recipe.id, recipe);
      } else {
        selectedRecipes.delete(recipe.id);
      }
      updateSelectionActions();
    });
    selectLabel.appendChild(selectCheckbox);

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

    li.appendChild(selectLabel);
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
  recipeEditor.setRecipe(recipe);
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
  shoppingListView.hidden = true;

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
  renderSource(sourceEl, recipe.source);

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
  selectedRecipes.delete(recipeId);
  updateSelectionActions();
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

function renderSource(element, source) {
  element.replaceChildren();
  if (!source) return;
  element.append('Source: ');
  if (/^https?:\/\//i.test(source)) {
    const link = document.createElement('a');
    link.href = source;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = source;
    element.append(link);
  } else {
    element.append(source);
  }
}
