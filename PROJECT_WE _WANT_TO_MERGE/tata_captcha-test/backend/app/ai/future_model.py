"""Future model placeholder for real inference integration."""

from __future__ import annotations

from app.ai.base_model import BaseAIModel


class FutureAIModel(BaseAIModel):
    """Placeholder model for future GPU/distributed implementations."""

    async def solve(self, task_type: str, payload_base64: str, mode: str) -> str:
        """Raise not implemented until real model integration."""

        raise NotImplementedError("Future model is not configured in this environment.")

