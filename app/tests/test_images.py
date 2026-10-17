"""Image decoding, orientation, upload bounds, and browser preview checks."""

import io

import httpx
import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image
from starlette.datastructures import Headers

from app.config import ROOT, Settings
from app.images import normalize_image, read_image
from app.main import create_app

HEIC_PHOTO = ROOT / "app/tests/fixtures/iphone-photo.heic"


def test_heic_orientation_and_metadata() -> None:
    """Convert a rotated HEIC and remove camera metadata from its JPEG."""
    mime, data = normalize_image(HEIC_PHOTO.read_bytes())
    assert mime == "image/jpeg"
    with Image.open(io.BytesIO(data)) as image:
        assert image.format == "JPEG"
        assert image.size == (80, 120)
        assert not image.getexif()
        assert "xmp" not in image.info


@pytest.mark.parametrize(
    "filename,mime",
    [
        ("IMG_0001.HEIC", "image/heic"),
        ("photo.heif", "image/heif"),
        ("IMG_0001.HEIC", "application/octet-stream"),
        ("photo.heic", ""),
        ("photo.heif", None),
    ],
)
async def test_heic_upload_types(filename: str, mime: str | None) -> None:
    """Accept typed and untyped HEIC uploads while verifying their bytes."""
    headers = Headers({"content-type": mime}) if mime is not None else Headers()
    file = UploadFile(
        io.BytesIO(HEIC_PHOTO.read_bytes()), filename=filename, headers=headers
    )
    result_mime, data = await read_image(file, Settings(_env_file=None))
    assert result_mime == "image/jpeg"
    assert data.startswith(b"\xff\xd8")


@pytest.mark.parametrize(
    "data,mime,filename,status",
    [
        (b"broken heic", "image/heic", "bad.heic", 422),
        (b"<svg/>", "image/svg+xml", "bad.heic", 415),
        (b"broken", "application/octet-stream", "bad.bin", 415),
        (b"a" * 101, "image/heic", "large.heic", 413),
    ],
)
async def test_heic_validation(
    data: bytes, mime: str, filename: str, status: int
) -> None:
    """Reject corrupt, unsupported, and oversized uploads before storage."""
    file = UploadFile(
        io.BytesIO(data), filename=filename, headers=Headers({"content-type": mime})
    )
    with pytest.raises(HTTPException) as error:
        await read_image(file, Settings(_env_file=None, max_image_bytes=100))
    assert error.value.status_code == status


@pytest.mark.parametrize(
    "filename,expected_size",
    [("iphone-photo.heic", (80, 120)), ("iphone-48mp.heic", (1536, 2048))],
)
async def test_heic_preview_without_database(
    filename: str, expected_size: tuple[int, int]
) -> None:
    """Provide a no-store JPEG preview without requiring a persisted case."""
    application = create_app(Settings(_env_file=None))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=application), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/images/preview",
            files={
                "image": (
                    "IMG_0001.HEIC",
                    HEIC_PHOTO.with_name(filename).read_bytes(),
                    "image/heic",
                )
            },
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/jpeg"
        assert response.headers["cache-control"] == "no-store"
        with Image.open(io.BytesIO(response.content)) as image:
            assert image.size == expected_size
        response = await client.post(
            "/api/v1/images/preview",
            files={"image": ("bad.heic", b"not an image", "image/heic")},
        )
        assert response.status_code == 422


def test_image_format_and_dimension_limits() -> None:
    """Keep the format allowlist and pixel limits across the new decoder."""
    data = io.BytesIO()
    Image.new("RGB", (20, 20)).save(data, format="GIF")
    with pytest.raises(HTTPException) as error:
        normalize_image(data.getvalue())
    assert error.value.status_code == 415
    data = io.BytesIO()
    Image.new("1", (8000, 8001)).save(data, format="PNG")
    with pytest.raises(HTTPException) as error:
        normalize_image(data.getvalue())
    assert error.value.status_code == 413
    assert "64 million pixels" in error.value.detail
