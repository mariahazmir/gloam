"""Error types for the Gloam pipeline (pure, no I/O)."""


class GloamError(Exception):
    """Base class for all pipeline errors."""


class InvalidArgumentError(GloamError):
    """A bad argument or config value. Names the argument, value and allowed range."""

    def __init__(self, argument: str, value: object, allowed: str):
        self.argument = argument
        self.value = value
        self.allowed = allowed
        super().__init__(
            f"argument '{argument}' rejected value {_show(value)}; allowed {allowed}"
        )


class InputFileError(GloamError):
    """A missing, unreadable, invalid or empty input file."""

    def __init__(self, path: object, problem: str):
        self.path = path
        self.problem = problem
        super().__init__(f"input file '{path}': {problem}")


class DataError(GloamError):
    """A bad value on a segment, such as a score that is NaN or out of range."""

    def __init__(self, segment_id: object, field: str, value: object):
        self.segment_id = segment_id
        self.field = field
        self.value = value
        super().__init__(
            f"segment '{segment_id}' field '{field}' has invalid value {_show(value)}"
        )


class TrainingError(GloamError):
    """Training cannot run, for example when no tagged lit segments exist."""


def _show(value: object) -> str:
    if isinstance(value, float):
        return f"{value:g}"
    return repr(value) if isinstance(value, str) else str(value)
