"""Better-route comparison against a user's criteria ranking.

Ranking is a list of criterion keys in priority order:
  ['price', 'legs', 'duration', 'airport_preference']

Comparison is lexicographic with a percentage tie tolerance: a lower-ranked
criterion is only considered when the higher-ranked ones are within tolerance.
"""
from decimal import Decimal


def _icon(criterion):
    if criterion == "price":
        return "€/lower is better"
    if criterion == "legs":
        return "fewer legs better"
    if criterion == "duration":
        return "shorter better"
    return "airport preference"


def _tolerance_fraction():
    from django.conf import settings
    return Decimal(str(getattr(settings, "TIE_TOLERANCE_PERCENT", 5.0))) / Decimal("100")


def _criterion_better(a, b, criterion, airport_rank):
    """Return +1 if a better, -1 if worse, 0 if tied. None if blank."""
    if criterion == "price":
        if a is None or b is None:
            return None
        if a < b:
            return 1
        if a > b:
            return -1
        return 0
    if criterion == "legs":
        if a is None or b is None:
            return None
        if a == b:
            return 0
        return 1 if a < b else -1
    if criterion == "duration":
        if a is None or b is None:
            return None
        if a == b:
            return 0
        return 1 if a < b else -1
    if criterion == "airport_preference":
        if airport_rank is None:
            return None
        # airport_rank is a dict mapping origin IATA -> rank (low is closer/better)
        ar_a = airport_rank.get(a)
        ar_b = airport_rank.get(b)
        if ar_a is None or ar_b is None:
            return None
        return 0 if ar_a == ar_b else (1 if ar_a < ar_b else -1)
    return None


def is_better(new, ref, ranking, airport_rank=None, tolerance_percent=None):
    """Return True if `new` is strictly better than `ref` under the ranking.

    new/ref are dicts of criterion->value for the criterion keys; missing keys
    are treated as 'unknown' (None) and never decide a comparison.
    """
    tol = Decimal(str(tolerance_percent)) if tolerance_percent is not None else _tolerance_fraction()

    for criterion in ranking:
        a = new.get(criterion)
        b = ref.get(criterion)
        cmp = _criterion_better(a, b, criterion, airport_rank)
        if cmp is None:
            continue  # unknown → skip this criterion

        if criterion == "price":
            # equality within tolerance => tie, fall through
            if a is not None and b is not None:
                diff = abs((Decimal(str(a)) - Decimal(str(b)))) / Decimal(str(b))
                if diff <= tol:
                    continue
        if cmp != 0:
            return cmp > 0

    return False