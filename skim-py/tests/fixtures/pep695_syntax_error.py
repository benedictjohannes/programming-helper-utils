type MyTypeAlias[T] = dict[str, T]


class ValidClass[T]:
    item: T

    def get_item(self) -> T:
        return self.item


def broken_func(x,
    return x


type SecondaryAlias = list[int]


def valid_after[U](val: U) -> U:
    return val
