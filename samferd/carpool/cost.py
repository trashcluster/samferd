"""Cost computation for car sharing (informative only)."""
from decimal import Decimal, ROUND_HALF_UP


def effective_parking(car):
    """Parking used for the split: the driver's override, else the airport default."""
    if car.parking_override is not None:
        return car.parking_override
    ea = car.departure_airport
    if ea is not None:
        try:
            return ea.airport.parking.amount
        except Exception:
            return Decimal("0.00")
    return Decimal("0.00")


def car_per_person_share(car):
    """(car cost + parking) / (driver + approved riders).

    Returns Decimal (possibly 0). Informative only — the app never transfers money.
    """
    cost_amount = car.cost_amount or Decimal("0.00")
    parking = effective_parking(car)
    total = cost_amount + parking
    occupants = 1 + car.riders.count()
    if occupants <= 0 or total <= 0:
        return total  # nothing car pooled yet → show parking+car cost unchanged
    share = total / Decimal(occupants)
    return share.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)