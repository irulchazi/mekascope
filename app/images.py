"""Bounded, decoded image validation; stored images have no metadata."""

import asyncio
import io
import warnings

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from app.config import Settings

register_heif_opener(thumbnails=False)

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
IMAGE_FORMAT_MESSAGE = "Use a JPEG, PNG, WebP, or HEIC/HEIF image."
MAX_IMAGE_PIXELS = 64_000_000


def normalize_image(data: bytes) -> tuple[str, bytes]:
    """Decode a supported photo and return an oriented JPEG without metadata."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.format not in {"JPEG", "PNG", "WEBP", "HEIF"}:
                    raise HTTPException(415, IMAGE_FORMAT_MESSAGE)
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise HTTPException(
                        413, "Image must contain at most 64 million pixels."
                    )
                image.thumbnail((2048, 2048))
                oriented = ImageOps.exif_transpose(image).convert("RGB")
                output = io.BytesIO()
                oriented.save(output, format="JPEG", quality=90)
                return "image/jpeg", output.getvalue()
    except HTTPException:
        raise
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise HTTPException(
            422, "The image could not be decoded. Upload a valid photo."
        ) from exc


async def read_image(file: UploadFile, settings: Settings) -> tuple[str, bytes]:
    """Read a bounded upload, accepting untyped HEIC files from mobile clients."""
    untyped_heif = file.content_type in {None, "", "application/octet-stream"} and (
        file.filename or ""
    ).lower().endswith((".heic", ".heif"))
    if file.content_type not in IMAGE_TYPES and not untyped_heif:
        raise HTTPException(415, IMAGE_FORMAT_MESSAGE)
    data = await file.read(settings.max_image_bytes + 1)
    if len(data) > settings.max_image_bytes:
        raise HTTPException(413, "Image exceeds the 10 MiB limit.")
    return await asyncio.to_thread(normalize_image, data)
