document.addEventListener('DOMContentLoaded', () => {
  const inputBox = document.getElementById('input-box');
  const urlSubmit = document.getElementById('url-submit');
  const photoSubmitButton = document.getElementById('photo-submit');

  if (urlSubmit && inputBox) {
    urlSubmit.addEventListener('click', () => sendLink(inputBox.value, urlSubmit));
  }

  if (photoSubmitButton) {
    photoSubmitButton.addEventListener('click', () => {
      const input = document.getElementById('photo');
      const files = [...(input?.files || [])];
      if (files.length === 0) {
        alert('Please choose at least one photo.');
        return;
      }
      if (files.length > 2) {
        alert('Please select at most 2 photos.');
        return;
      }
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          alert(`"${file.name}" is too large. Maximum size is 10 MB per file.`);
          return;
        }
      }
      sendPhotos(files, photoSubmitButton);
    });
  }
});

function setLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.dataset.originalText = button.dataset.originalText || button.textContent;
  button.textContent = loading ? 'Processing...' : button.dataset.originalText;
}

async function sendLink(link, button) {
  if (!link || link.trim() === '') {
    alert('Please enter a recipe URL.');
    return;
  }

  setLoading(button, true);
  try {
    const response = await fetch('/recipe_link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: link }),
    });

    const data = await response.json();
    if (!response.ok) {
      alert(data.error || 'Failed to extract recipe from URL.');
      return;
    }

    window.sessionStorage.setItem('recipe', JSON.stringify(data));
    window.location.href = '/main';
  } catch {
    alert('Something went wrong. Please try again.');
  } finally {
    setLoading(button, false);
  }
}

async function sendPhotos(files, button) {
  const formData = new FormData();
  files.forEach((file) => formData.append('photos', file));

  setLoading(button, true);
  try {
    const response = await fetch('/recipe_image', {
      method: 'POST',
      body: formData,
    });

    let data;
    try {
      data = await response.json();
    } catch {
      alert('Upload failed. Please try again.');
      return;
    }

    if (!response.ok) {
      alert(data.error || 'Failed to extract recipe from image.');
      return;
    }

    window.sessionStorage.setItem('recipe', JSON.stringify(data));
    window.location.href = '/main';
  } catch {
    alert('Something went wrong. Please try again.');
  } finally {
    setLoading(button, false);
  }
}

function showChooseSection() {
  window.location.href = '/all-recipes';
}

function showUploadSection() {
  document.getElementById('upload-section').classList.add('active');
  document.getElementById('choose-section').classList.remove('active');
}

function chooseLinkSubmitSection() {
  document.getElementById('photo-submit-section').classList.remove('active');
  document.getElementById('link-submit-section').classList.add('active');
}

function choosePhotoSubmitSection() {
  document.getElementById('link-submit-section').classList.remove('active');
  document.getElementById('photo-submit-section').classList.add('active');
}
