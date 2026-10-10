"""Enumerations shared by models, schemas and services."""

import enum


class RoastIntensity(str, enum.Enum):
    """How harsh the generated roast should be."""

    MILD = "mild"
    MEDIUM = "medium"
    SAVAGE = "savage"


class RoastStatus(str, enum.Enum):
    """Lifecycle status of a roast."""

    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class SourceType(str, enum.Enum):
    """How the submission's code was provided."""

    PASTE = "paste"
    UPLOAD = "upload"
    GITHUB_COMMIT = "github_commit"
    GITHUB_REPO = "github_repo"
