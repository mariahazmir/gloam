"""Argument validators (pure, no I/O). Each returns the value when valid."""

import math
from typing import Sequence

from .errors import InvalidArgumentError


def _num(x: float) -> str:
    return f"{x:g}" if isinstance(x, float) else str(x)


def check_finite(name: str, value: float) -> float:
    """Reject bools, non-numbers, NaN and infinite values."""
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
    ):
        raise InvalidArgumentError(name, value, "a finite number")
    return value


def check_range(
    name: str,
    value: float,
    lo: float,
    hi: float,
    lo_open: bool = False,
    hi_open: bool = False,
) -> float:
    """Require lo <= value <= hi, with either bound optionally exclusive."""
    if lo_open and hi_open:
        allowed = f"strictly between {_num(lo)} and {_num(hi)}"
    else:
        allowed = f"{_num(lo)} to {_num(hi)}"
        if lo_open:
            allowed += f" (excluding {_num(lo)})"
        if hi_open:
            allowed += f" (excluding {_num(hi)})"
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
    ):
        raise InvalidArgumentError(name, value, allowed)
    below = value <= lo if lo_open else value < lo
    above = value >= hi if hi_open else value > hi
    if below or above:
        raise InvalidArgumentError(name, value, allowed)
    return value


def check_text_length(name: str, value: str, lo: int, hi: int) -> str:
    """Require a string of lo to hi characters that is not whitespace-only."""
    allowed = f"{lo} to {hi} characters, not only whitespace"
    if not isinstance(value, str) or not lo <= len(value) <= hi or not value.strip():
        raise InvalidArgumentError(name, value, allowed)
    return value


def check_count_between(name: str, items: Sequence, lo: int, hi: int) -> Sequence:
    """Require lo to hi items."""
    try:
        n = len(items)
    except TypeError:
        raise InvalidArgumentError(name, items, f"{lo} to {hi} items") from None
    if not lo <= n <= hi:
        raise InvalidArgumentError(name, f"{n} items", f"{lo} to {hi} items")
    return items
