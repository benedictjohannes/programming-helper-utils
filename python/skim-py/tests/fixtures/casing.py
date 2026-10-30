from typing import Optional


class BaseItem:
    def execute(self) -> None:
        pass


class Item(BaseItem):
    """Item class"""

    def process(self) -> None:
        pass


def item() -> Item:
    return Item()


def other_fn() -> None:
    pass
