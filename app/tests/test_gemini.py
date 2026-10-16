import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from google import genai
from google.genai import types

from app.ai import GeminiProvider
from app.catalog import SAMPLE_IMAGE
from app.config import Settings
from app.images import normalize_image
from app.schemas import ScanResult
from app.tests.fakes import FakeProvider


async def test_sdk_adapter_structured_input():
    provider = GeminiProvider(Settings(_env_file=None, gemini_api_key=""))
    result = FakeProvider().results["scan"]
    generate = AsyncMock(return_value=SimpleNamespace(text=result.model_dump_json()))
    provider.client = SimpleNamespace(
        models=SimpleNamespace(generate_content=generate), aclose=AsyncMock()
    )
    response = await provider.generate(
        "scan", {"symptom": "Noise"}, [("image/jpeg", b"photo")], ScanResult
    )
    assert response == result
    kwargs = generate.call_args.kwargs
    assert kwargs["config"].response_json_schema == ScanResult.model_json_schema()
    assert kwargs["config"].response_schema is None
    assert kwargs["contents"][1].inline_data.data == b"photo"
    generate.return_value = SimpleNamespace(text="{malformed")
    with pytest.raises(ValueError):
        await provider.generate("scan", {}, [], ScanResult)
    await provider.close()


@pytest.mark.parametrize("operation", ["scan", "investigate", "verify"])
async def test_sdk_transport_uses_json_schema(operation):
    """Exercise the SDK serializer, which an AsyncMock of generate_content skips."""
    expected = FakeProvider().results[operation]

    def handle(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        config = payload["generationConfig"]
        assert "responseSchema" not in config
        assert config["responseJsonSchema"]["additionalProperties"] is False
        assert config["responseJsonSchema"] == type(expected).model_json_schema()
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "role": "model",
                            "parts": [{"text": expected.model_dump_json()}],
                        },
                        "finishReason": "STOP",
                    }
                ],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
        provider = GeminiProvider(Settings(_env_file=None, gemini_api_key=""))
        provider.client = genai.Client(
            api_key="test-only-key",
            http_options=types.HttpOptions(httpx_async_client=http),
        ).aio
        try:
            actual = await provider.generate(
                operation, {}, [("image/jpeg", b"photo")], type(expected)
            )
            assert actual == expected
        finally:
            await provider.close()


@pytest.mark.live
async def test_real_gemini_smoke():
    import os

    if os.getenv("RUN_GEMINI_SMOKE") != "1":
        pytest.skip("Set RUN_GEMINI_SMOKE=1 to make a real Gemini request.")
    settings = Settings()
    if not settings.gemini_api_key.get_secret_value():
        pytest.fail("GEMINI_API_KEY is required for the live smoke test.")
    provider = GeminiProvider(settings)
    try:
        photo = await asyncio.to_thread(normalize_image, SAMPLE_IMAGE.read_bytes())
        result = await asyncio.wait_for(
            provider.generate(
                "scan", {"symptom": "Clicking while shifting"}, [photo], ScanResult
            ),
            settings.ai_timeout_seconds,
        )
        assert isinstance(result, ScanResult)
    finally:
        await provider.close()
