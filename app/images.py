"""Bounded, decoded image validation; stored images have no metadata."""

import asyncio
import io
import warnings

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import Settings


def normalize_image(data: bytes) -> tuple[str, bytes]:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.format not in {"JPEG", "PNG", "WEBP"}:
                    raise HTTPException(415, "Use a JPEG, PNG, or WebP image.")
                if image.width * image.height > 30_000_000:
                    raise HTTPException(
                        413, "Image must contain at most 30 million pixels."
                    )
                image.load()
                oriented = ImageOps.exif_transpose(image).convert("RGB")
                oriented.thumbnail((2048, 2048))
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
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(415, "Use a JPEG, PNG, or WebP image.")
    data = await file.read(settings.max_image_bytes + 1)
    if len(data) > settings.max_image_bytes:
        raise HTTPException(413, "Image exceeds the 10 MiB limit.")
    return await asyncio.to_thread(normalize_image, data)
