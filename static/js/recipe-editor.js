function createRecipeEditor(container, onSaved) {
  const host = container.querySelector('#recipe-editor');
  host.innerHTML = `
    <button class="edit-recipe-btn" type="button">Edit recipe</button>
    <form class="recipe-edit-form" hidden>
      <h2>Edit recipe</h2>
      <div class="recipe-edit-grid">
        <label>Title <input name="title" type="text" maxlength="200" required></label>
        <label>Type <input name="type" type="text" maxlength="80" required></label>
        <label>Prep time <input name="prep_time" type="text" maxlength="80"></label>
        <label>Cook time <input name="cook_time" type="text" maxlength="80"></label>
        <label>Servings <input name="servings" type="text" inputmode="numeric" placeholder="Number or N/A"></label>
        <label>Language <input name="language" type="text" maxlength="30"></label>
      </div>
      <label>Ingredients <span class="edit-hint">One item per line</span>
        <textarea name="ingredients" rows="7"></textarea>
      </label>
      <label>Instructions <span class="edit-hint">One step per line</span>
        <textarea name="instructions" rows="8"></textarea>
      </label>
      <label>Additional notes <span class="edit-hint">One note per line</span>
        <textarea name="additional_notes" rows="4"></textarea>
      </label>
      <label>Source <input name="source" type="text" maxlength="2000"></label>
      <p class="form-error" role="alert"></p>
      <div class="recipe-edit-actions">
        <button type="submit">Save</button>
        <button class="cancel-edit-btn" type="button">Cancel</button>
      </div>
    </form>
    <p class="recipe-save-status" role="status"></p>
  `;

  const editButton = host.querySelector('.edit-recipe-btn');
  editButton.hidden = true;
  const form = host.querySelector('form');
  const error = form.querySelector('.form-error');
  const saveButton = form.querySelector('[type="submit"]');
  const cancelButton = form.querySelector('.cancel-edit-btn');
  const status = host.querySelector('.recipe-save-status');
  let recipe = null;

  function close() {
    form.hidden = true;
    editButton.hidden = !recipe;
    container.classList.remove('recipe-editing');
    error.textContent = '';
  }

  editButton.addEventListener('click', () => {
    if (!recipe) return;
    for (const field of ['title', 'type', 'prep_time', 'cook_time', 'servings', 'language', 'source']) {
      form.elements[field].value = recipe[field] ?? '';
    }
    for (const field of ['ingredients', 'instructions', 'additional_notes']) {
      form.elements[field].value = (recipe[field] || []).join('\n');
    }
    error.textContent = '';
    status.textContent = '';
    editButton.hidden = true;
    form.hidden = false;
    container.classList.add('recipe-editing');
    form.elements.title.focus();
  });

  cancelButton.addEventListener('click', close);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!recipe) return;
    const servingsText = form.elements.servings.value.trim();
    let servings = null;
    if (servingsText) {
      servings = /^\d+$/.test(servingsText) ? Number(servingsText) : servingsText;
      if (servings !== 'N/A' && (!Number.isSafeInteger(servings) || servings <= 0)) {
        error.textContent = 'Servings must be a positive whole number or N/A.';
        return;
      }
    }

    const edited = { servings };
    for (const field of ['title', 'type', 'prep_time', 'cook_time', 'language', 'source']) {
      edited[field] = form.elements[field].value.trim();
    }
    for (const field of ['ingredients', 'instructions', 'additional_notes']) {
      edited[field] = form.elements[field].value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    }

    error.textContent = '';
    saveButton.disabled = true;
    cancelButton.disabled = true;
    saveButton.textContent = 'Saving...';
    const savingRecipeId = recipe.id;
    try {
      const response = await fetch(`/api/recipes/${recipe.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edited),
      });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Could not save recipe. Refresh the page and try again.');
      }
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || 'Could not save recipe.');
      if (recipe?.id === savingRecipeId) recipe = saved;
      onSaved(saved);
      if (recipe?.id === savingRecipeId) {
        close();
        status.textContent = 'Recipe saved.';
      }
    } catch (cause) {
      error.textContent = cause.message || 'Could not save recipe.';
    } finally {
      saveButton.disabled = false;
      cancelButton.disabled = false;
      saveButton.textContent = 'Save';
    }
  });

  return {
    setRecipe(nextRecipe) {
      recipe = nextRecipe;
      status.textContent = '';
      editButton.hidden = !recipe;
      if (form.hidden === false) close();
    },
    close,
  };
}
