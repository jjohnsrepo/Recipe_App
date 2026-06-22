document.addEventListener('DOMContentLoaded', () => {
  populateRecipeFromStorage();
});

let currentRecipeId = null;

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
  }

  window.sessionStorage.removeItem('recipe');
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
