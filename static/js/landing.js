document.addEventListener('DOMContentLoaded', () => {
  const inputBox = document.getElementById('input-box');
  const urlSubmit = document.getElementById('url-submit');
  const photoSubmitButton = document.getElementById('photo-submit');

  if (urlSubmit && inputBox) {
    urlSubmit.addEventListener('click', () => sendLink(inputBox.value));
  }

  if (photoSubmitButton) {
    photoSubmitButton.addEventListener('click', () => {
      const input = document.getElementById('photo');
      const file = input?.files?.[0];
      if (file) sendPhoto(file);
    });
  }
});

async function sendLink(link) {
  if (!link || link.trim() === '') {
    alert('Box must not be empty');
    return;
  }

  const response = await fetch('/recipe_link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url: link })
  });

  const data = await response.json();
  window.sessionStorage.setItem('recipe', JSON.stringify(data));
  window.location.href = '/main';
}

async function sendPhoto(file) {
  const formData = new FormData();
  formData.append('photo', file);

  const response = await fetch('/recipe_image', {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  window.sessionStorage.setItem('recipe', JSON.stringify(data));
  window.location.href = '/main';
}

function showChooseSection() {
    window.location.href = '/all-recipes'
  document.getElementById("choose-section").classList.add("active");
  document.getElementById("upload-section").classList.remove("active");
}

function showUploadSection() {
  document.getElementById("upload-section").classList.add("active");
  document.getElementById("choose-section").classList.remove("active");
}

function chooseLinkSubmitSection() {
  document.getElementById("photo-submit-section").classList.remove("active");
  document.getElementById("link-submit-section").classList.add("active");
}

function choosePhotoSubmitSection() {
  document.getElementById("link-submit-section").classList.remove("active");
  document.getElementById("photo-submit-section").classList.add("active");
}
