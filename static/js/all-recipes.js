const recipesList = document.getElementById("recipes-list")
document.addEventListener('DOMContentLoaded', () => {
  fetchAndDisplayRecipes();
});





async function fetchAndDisplayRecipes() {
  let response = await fetch("/api/recipes");
  let data = await response.json();

  data.forEach(element => {
    let recipeCardDiv = document.createElement("div") 
    recipeCardDiv.innerHTML=element.title
    recipesList.appendChild(recipeCardDiv)
    console.log(element);
  });


}
