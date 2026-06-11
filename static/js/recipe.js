document.addEventListener('DOMContentLoaded', () => {
  populateRecipeFromStorage();
});

function populateRecipeFromStorage() {
  const raw = window.sessionStorage.getItem('recipe');
  if (!raw) return;

  let recipe;
  try {
    recipe = JSON.parse(raw);
  } catch (error) {
    return;
  }

  Object.entries(recipe).forEach(([key, value]) => {
    const elementId = key.replace(/_/g, '-');
    const element = document.getElementById(elementId);
    if (!element) return;

    if (Array.isArray(value)) {
      element.innerHTML = '';
      value.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        element.appendChild(li);
      });
      return;
    }

    element.textContent = value || '';
  });

  window.sessionStorage.removeItem('recipe');
}
