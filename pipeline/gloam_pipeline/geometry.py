"""Projection, length, distance and point-in-polygon (pure, no I/O).

Coordinates passed in from GeoJSON are (lon, lat) in degrees. Projected
points are (x, y) in metres. Every function rejects NaN and infinite input
with InvalidArgumentError naming the argument.
"""

import math
from typing import Any, Sequence

from .checks import check_finite, check_range
from .errors import InvalidArgumentError

EARTH_RADIUS_M = 6371008.8


def _check_point(name: str, p: Sequence[float]) -> tuple[float, float]:
    try:
        x, y = p
    except (TypeError, ValueError):
        raise InvalidArgumentError(name, p, "a pair of finite numbers") from None
    return check_finite(f"{name}[0]", x), check_finite(f"{name}[1]", y)


def _check_line(name: str, line: Sequence[Sequence[float]], min_points: int):
    try:
        pts = [_check_point(f"{name}[{i}]", p) for i, p in enumerate(line)]
    except TypeError:
        raise InvalidArgumentError(name, line, "a list of points") from None
    if len(pts) < min_points:
        raise InvalidArgumentError(name, f"{len(pts)} points", f"at least {min_points} points")
    return pts


class Projector:
    """Local equirectangular projection to metres around (lat0, lon0)."""

    def __init__(self, lat0: float, lon0: float):
        check_range("lat0", lat0, -90, 90)
        check_range("lon0", lon0, -180, 180)
        self.lat0 = lat0
        self.lon0 = lon0
        self._kx = math.radians(1) * EARTH_RADIUS_M * math.cos(math.radians(lat0))
        self._ky = math.radians(1) * EARTH_RADIUS_M

    def project(self, lon: float, lat: float) -> tuple[float, float]:
        check_finite("lon", lon)
        check_finite("lat", lat)
        return (lon - self.lon0) * self._kx, (lat - self.lat0) * self._ky

    def project_all(self, coords: Sequence[Sequence[float]]) -> list[tuple[float, float]]:
        pts = _check_line("coords", coords, 0)
        return [self.project(lon, lat) for lon, lat in pts]


def polyline_length_m(coords: Sequence[Sequence[float]]) -> float:
    """Length in metres of a (lon, lat) polyline; 0.0 for fewer than 2 points."""
    pts = _check_line("coords", coords, 0)
    if len(pts) < 2:
        return 0.0
    lat0 = sum(p[1] for p in pts) / len(pts)
    lon0 = sum(p[0] for p in pts) / len(pts)
    proj = Projector(max(-90.0, min(90.0, lat0)), max(-180.0, min(180.0, lon0)))
    xy = [proj.project(lon, lat) for lon, lat in pts]
    return sum(math.dist(a, b) for a, b in zip(xy, xy[1:]))


def point_polyline_distance_m(p: Sequence[float], line: Sequence[Sequence[float]]) -> float:
    """Shortest distance from p to a polyline; all in the same planar units (metres)."""
    px, py = _check_point("p", p)
    pts = _check_line("line", line, 1)
    if len(pts) == 1:
        return math.dist((px, py), pts[0])
    best = math.inf
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        t = 0.0 if seg2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
        best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    return best


def point_in_polygon(p: Sequence[float], ring: Sequence[Sequence[float]]) -> bool:
    """Ray casting against the outer ring. Boundary points may fall either way."""
    px, py = _check_point("p", p)
    pts = _check_line("ring", ring, 3)
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


class GridIndex:
    """Uniform grid over projected points (x, y, payload).

    With cell size equal to the query distance, every point within that
    distance of a query lies in the query's cell or one of its 8 neighbours.
    """

    def __init__(self, items: Sequence[tuple[float, float, Any]], cell_m: float):
        check_range("cell_m", cell_m, 0, math.inf, lo_open=True, hi_open=True)
        self.cell_m = cell_m
        self._cells: dict[tuple[int, int], list[tuple[float, float, Any]]] = {}
        for item in items:
            x, y = _check_point("item", item[:2])
            self._cells.setdefault(self._key(x, y), []).append((x, y, item[2]))

    def _key(self, x: float, y: float) -> tuple[int, int]:
        return math.floor(x / self.cell_m), math.floor(y / self.cell_m)

    def candidates(self, x: float, y: float) -> list[tuple[float, float, Any]]:
        """Items in the 3x3 cells around (x, y): a superset of those within cell_m."""
        check_finite("x", x)
        check_finite("y", y)
        cx, cy = self._key(x, y)
        out: list[tuple[float, float, Any]] = []
        for i in (cx - 1, cx, cx + 1):
            for j in (cy - 1, cy, cy + 1):
                out.extend(self._cells.get((i, j), ()))
        return out

    def within(self, x: float, y: float, dist_m: float | None = None) -> list[Any]:
        """Payloads of items within dist_m (default and maximum: cell_m)."""
        d = self.cell_m if dist_m is None else check_range("dist_m", dist_m, 0, self.cell_m)
        return [pl for ix, iy, pl in self.candidates(x, y) if math.hypot(ix - x, iy - y) <= d]
