import os
import tempfile
from typing import Optional, Tuple

IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "heic", "heif", "webp"}
MAX_DIMENSION = 2048
TARGET_MAX_BYTES = 4 * 1024 * 1024


def is_image_file(filepath: str) -> bool:
    ext = filepath.rsplit(".", 1)[-1].lower() if "." in filepath else ""
    return ext in IMAGE_EXTENSIONS


def prepare_image(filepath: str) -> Tuple[str, Optional[str]]:
    """
    Normalize an image for vision API upload.
    Returns (path_to_use, temp_path_to_delete_or_none).
    """
    try:
        from PIL import Image
    except ImportError:
        raise ValueError("Image processing requires the Pillow package.")

    try:
        if filepath.rsplit(".", 1)[-1].lower() in ("heic", "heif"):
            from pillow_heif import register_heif_opener

            register_heif_opener()
    except ImportError:
        ext = filepath.rsplit(".", 1)[-1].lower()
        if ext in ("heic", "heif"):
            raise ValueError(
                "HEIC photos require pillow-heif. Install it or convert the photo to JPEG first."
            )

    img = Image.open(filepath)
    img = img.convert("RGB")

    width, height = img.size
    if max(width, height) > MAX_DIMENSION:
        scale = MAX_DIMENSION / max(width, height)
        img = img.resize(
            (int(width * scale), int(height * scale)),
            Image.Resampling.LANCZOS,
        )

    temp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    temp_path = temp.name
    temp.close()

    quality = 85
    while quality >= 50:
        img.save(temp_path, format="JPEG", quality=quality, optimize=True)
        if os.path.getsize(temp_path) <= TARGET_MAX_BYTES:
            return temp_path, temp_path
        quality -= 10

    return temp_path, temp_path
