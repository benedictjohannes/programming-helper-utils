from enum import Enum
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")


class Color(Enum):
    RED = 1
    GREEN = 2
    BLUE = 3


@dataclass
class Container(Generic[T]):
    item: T
    count: int = 1
    active: bool = True

    def get_item(self) -> T:
        return self.item
