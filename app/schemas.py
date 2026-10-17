"""Public DTOs and the structured response contracts used with Gemini."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Score = Annotated[int, Field(ge=0, le=100)]
Text = Annotated[str, Field(min_length=1, max_length=4000)]
Stage = Literal["observe", "understand", "investigate", "verify", "act"]
BoardStatus = Literal["todo", "in_progress", "done"]


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Annotation(Schema):
    label: Text
    description: str = Field(
        default="",
        max_length=1200,
        description="A brief explanation of this component's function and visible details.",
    )
    # Gemini image coordinates, independent of the original image dimensions.
    box: Annotated[
        list[Annotated[int, Field(ge=0, le=1000)]], Field(min_length=4, max_length=4)
    ]

    @model_validator(mode="after")
    def valid_box(self) -> "Annotation":
        if self.box[0] >= self.box[2] or self.box[1] >= self.box[3]:
            raise ValueError("box must be [ymin, xmin, ymax, xmax] with positive area")
        return self


class ScanResult(Schema):
    recognized: bool
    equipment: Text
    component: str | None = Field(max_length=300)
    model: str | None = Field(max_length=300)
    confidence: Score
    summary: Text
    annotations: list[Annotation] = Field(max_length=12)

    @model_validator(mode="after")
    def component_required(self) -> "ScanResult":
        if self.recognized and not self.component:
            raise ValueError("recognized bicycles require an identified component")
        return self


class Source(Schema):
    label: Text
    status: Literal["provided", "inferred", "missing"]
    detail: Text


class Evidence(Schema):
    text: Text
    source: Literal["photo", "user", "sample", "inference"]


class Hypothesis(Schema):
    name: Text
    confidence: Score
    reasoning: Text


class Check(Schema):
    title: Text
    instruction: Text


class InvestigationResult(Schema):
    summary: Text
    sources: list[Source] = Field(min_length=1, max_length=12)
    evidence: list[Evidence] = Field(max_length=20)
    hypotheses: list[Hypothesis] = Field(min_length=1, max_length=8)
    checks: list[Check] = Field(min_length=1, max_length=6)


class VerificationResult(Schema):
    conclusion: Literal["supported", "inconclusive"]
    diagnosis: Text
    confidence: Score
    severity: Literal["low", "medium", "high", "unknown"]
    summary: Text
    action: Text
    verification: Text
    expected: Text


class Step(Schema):
    id: str
    title: str
    instruction: str
    completed: bool = False
    observation: str = ""
    image_url: str | None = None


class TaskView(Schema):
    id: int
    created_at: datetime
    status: Literal["open", "resolved"]
    board_status: BoardStatus
    recommendation: VerificationResult
    resolved_at: datetime | None = None
    outcome_notes: str | None = None


class MaintenanceTaskView(TaskView):
    case_id: UUID
    equipment: str
    component: str | None
    symptom: str


class TaskStatusUpdate(Schema):
    status: BoardStatus
    notes: str = Field(default="", max_length=4000)


class CaseView(Schema):
    id: UUID
    created_at: datetime
    symptom: str
    context: dict[str, str]
    image_url: str
    available_stages: list[Stage]
    scan: ScanResult | None
    investigation: InvestigationResult | None
    verification: VerificationResult | None
    steps: list[Step]
    operation: str | None
    operation_expires_at: datetime | None
    last_error: str | None
    task: TaskView | None


class Approval(Schema):
    approved: Literal[True]


class Resolution(Schema):
    notes: str = Field(
        default="Resolved by user; no additional observations supplied.",
        max_length=4000,
    )
