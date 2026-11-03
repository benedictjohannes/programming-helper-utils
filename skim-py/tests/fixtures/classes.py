from __future__ import annotations
from typing import Optional


class Processor:
    factor: int = 10

    @classmethod
    def create(cls, factor: int = 10) -> Processor:
        p = cls()
        p.factor = factor
        return p

    @staticmethod
    def validate_value(val: int) -> bool:
        return val > 0

    @property
    def current_factor(self) -> int:
        return self.factor

    async def compute_async(self, data: list[int]) -> list[int]:
        return [x * self.factor for x in data]
