"""Explicit injection only; this provider is never selected by production settings."""

import asyncio
from collections import Counter
from copy import deepcopy
from typing import TypeVar

from app.schemas import InvestigationResult, ScanResult, Schema, VerificationResult

T = TypeVar("T", bound=Schema)


class FakeProvider:
    def __init__(self) -> None:
        self.calls: Counter[str] = Counter()
        self.payloads: list[dict] = []
        self.failure: Exception | None = None
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.release.set()
        self.results = {
            "scan": ScanResult(
                recognized=True,
                equipment="Road bicycle",
                component="Rear derailleur",
                model=None,
                confidence=84,
                summary="A bicycle shifting assembly is visible.",
                annotations=[{"label": "Rear derailleur", "box": [200, 200, 700, 700]}],
            ),
            "investigate": InvestigationResult(
                summary="Investigate the reported shifting noise.",
                sources=[
                    {
                        "label": "Service history",
                        "status": "missing",
                        "detail": "No verified service records were checked.",
                    }
                ],
                evidence=[{"text": "A shifting noise was reported.", "source": "user"}],
                hypotheses=[
                    {
                        "name": "Indexing alignment",
                        "confidence": 73,
                        "reasoning": "Consistent with the reported symptom.",
                    },
                    {
                        "name": "Component wear",
                        "confidence": 27,
                        "reasoning": "Measurements are unavailable.",
                    },
                ],
                checks=[
                    {
                        "title": "Inspect chain position",
                        "instruction": "With the bike secure, note the chain position.",
                    },
                    {
                        "title": "Observe shifting",
                        "instruction": "Record any rubbing while turning the crank by hand.",
                    },
                ],
            ),
            "verify": VerificationResult(
                conclusion="inconclusive",
                diagnosis="Further indexing inspection needed",
                confidence=61,
                severity="unknown",
                summary="Confirmation alone does not establish a mechanical finding.",
                action="Have a technician inspect the derailleur indexing.",
                verification="Check shifting on a stand after inspection.",
                expected="Findings establish whether adjustment is appropriate.",
            ),
        }

    async def generate(
        self,
        operation: str,
        payload: dict,
        images: list[tuple[str, bytes]],
        schema: type[T],
    ) -> T:
        self.calls[operation] += 1
        self.payloads.append(deepcopy({**payload, "image_count": len(images)}))
        self.started.set()
        await self.release.wait()
        if self.failure:
            failure, self.failure = self.failure, None
            raise failure
        return schema.model_validate(self.results[operation].model_dump())

    async def close(self) -> None:
        pass
