"""
"Capture from now on" starting point.

The first scrape ever records every project that is already listed on Workana
and stores none of them. From then on those ids are ignored, so only projects
posted after that moment reach the database (and the extension's queue).

Ids, not timestamps: Workana only shows relative dates ("3 hours ago"), which
are too coarse to draw a clean cutoff with. The set is kept in a local file so
a restart doesn't take a new baseline and silently swallow what was posted
while the scraper was down. Delete the file to start over.
"""
import json
from pathlib import Path
from typing import Iterable, Optional, Set

BASELINE_FILE = Path(__file__).parent.parent / "scraper_baseline.json"


def load_baseline(path: Path = BASELINE_FILE) -> Optional[Set[str]]:
    """The recorded ids, or None if no baseline has been taken yet."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return set(data["ids"])
    except FileNotFoundError:
        return None
    except (ValueError, KeyError, TypeError, OSError):
        # A corrupt file must not silently become "no baseline": that would
        # re-take it and drop whatever was posted since. Fail loudly instead.
        raise RuntimeError(
            f"{path.name} is unreadable — fix or delete it (deleting makes the next "
            "scrape the new starting point)."
        )


def save_baseline(ids: Iterable[str], path: Path = BASELINE_FILE) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"ids": sorted(set(ids))}), encoding="utf-8")
    tmp.replace(path)
