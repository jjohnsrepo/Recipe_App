const recipesList = document.getElementById('recipes-list');
const searchInput = document.getElementById('search-input');
const favoritesOnly = document.getElementById('favorites-only');
const typeFilter = document.getElementById('type-filter');
const recipeEmpty = document.getElementById('recipe-empty');
const recipeContent = document.getElementById('recipe-content');
const detailFavoriteBtn = document.getElementById('detail-favorite-btn');
const deleteRecipeBtn = document.getElementById('delete-recipe-btn');

let selectedRecipeId = null;
let selectedRecipeTitle = '';
let debounceTimer = null;

document.addEventListener('DOMContentLoaded', () => {
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
});

function buildApiUrl() {
  const params = new URLSearchParams();
  const query = searchInput.value.trim();
  if (query) params.set('q', query);
  if (favoritesOnly.checked) params.set('favorite', '1');
  if (typeFilter.value) params.set('type', typeFilter.value);
  const qs = params.toString();
  return qs ? `/api/recipes?${qs}` : '/api/recipes';
}

async function fetchAndDisplayRecipes() {
  const response = await fetch(buildApiUrl());
  const data = await response.json();
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
  await fetchAndDisplayRecipes();
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
