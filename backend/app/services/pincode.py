"""Live pincode lookup (India Post API) and delivery-time estimate from the Hyderabad warehouse."""
import logging
from datetime import datetime, timedelta, timezone

import httpx

log = logging.getLogger("pincode")
_cache: dict[str, dict | None] = {}

SOUTH = {"Andhra Pradesh", "Karnataka", "Tamil Nadu", "Kerala", "Puducherry"}
FAR = {"Jammu and Kashmir", "Jammu & Kashmir", "Ladakh", "Arunachal Pradesh", "Assam", "Manipur", "Meghalaya",
       "Mizoram", "Nagaland", "Sikkim", "Tripura", "Andaman and Nicobar Islands", "Andaman & Nicobar Islands",
       "Lakshadweep"}
HYDERABAD_DISTRICTS = {"Hyderabad", "Rangareddy", "Ranga Reddy", "Medchal Malkajgiri", "Medchal-Malkajgiri"}


# India Post postal circles by pincode prefix (used when the live API is unreachable)
_PREFIX3 = {
    "403": "Goa", "605": "Puducherry", "737": "Sikkim", "744": "Andaman and Nicobar Islands", "682": "Kerala",
    "790": "Arunachal Pradesh", "791": "Arunachal Pradesh", "792": "Arunachal Pradesh", "793": "Meghalaya",
    "794": "Meghalaya", "795": "Manipur", "796": "Mizoram", "797": "Nagaland", "798": "Nagaland", "799": "Tripura",
    "160": "Chandigarh", "194": "Ladakh", "244": "Uttarakhand", "246": "Uttarakhand", "247": "Uttarakhand",
    "248": "Uttarakhand", "249": "Uttarakhand", "262": "Uttarakhand", "263": "Uttarakhand", "490": "Chhattisgarh",
    "491": "Chhattisgarh", "492": "Chhattisgarh", "493": "Chhattisgarh", "494": "Chhattisgarh", "495": "Chhattisgarh",
    "496": "Chhattisgarh", "497": "Chhattisgarh", "814": "Jharkhand", "815": "Jharkhand", "816": "Jharkhand",
    "822": "Jharkhand", "825": "Jharkhand", "826": "Jharkhand", "827": "Jharkhand", "828": "Jharkhand",
    "829": "Jharkhand", "831": "Jharkhand", "832": "Jharkhand", "833": "Jharkhand", "834": "Jharkhand", "835": "Jharkhand",
}
_PREFIX2 = {
    "11": "Delhi", "12": "Haryana", "13": "Haryana", "14": "Punjab", "15": "Punjab", "16": "Punjab",
    "17": "Himachal Pradesh", "18": "Jammu and Kashmir", "19": "Jammu and Kashmir", "20": "Uttar Pradesh",
    "21": "Uttar Pradesh", "22": "Uttar Pradesh", "23": "Uttar Pradesh", "24": "Uttar Pradesh", "25": "Uttar Pradesh",
    "26": "Uttar Pradesh", "27": "Uttar Pradesh", "28": "Uttar Pradesh", "30": "Rajasthan", "31": "Rajasthan",
    "32": "Rajasthan", "33": "Rajasthan", "34": "Rajasthan", "36": "Gujarat", "37": "Gujarat", "38": "Gujarat",
    "39": "Gujarat", "40": "Maharashtra", "41": "Maharashtra", "42": "Maharashtra", "43": "Maharashtra",
    "44": "Maharashtra", "45": "Madhya Pradesh", "46": "Madhya Pradesh", "47": "Madhya Pradesh", "48": "Madhya Pradesh",
    "49": "Chhattisgarh", "50": "Telangana", "51": "Andhra Pradesh", "52": "Andhra Pradesh", "53": "Andhra Pradesh",
    "56": "Karnataka", "57": "Karnataka", "58": "Karnataka", "59": "Karnataka", "60": "Tamil Nadu", "61": "Tamil Nadu",
    "62": "Tamil Nadu", "63": "Tamil Nadu", "64": "Tamil Nadu", "67": "Kerala", "68": "Kerala", "69": "Kerala",
    "70": "West Bengal", "71": "West Bengal", "72": "West Bengal", "73": "West Bengal", "74": "West Bengal",
    "75": "Odisha", "76": "Odisha", "77": "Odisha", "78": "Assam", "80": "Bihar", "81": "Bihar", "82": "Bihar",
    "83": "Jharkhand", "84": "Bihar", "85": "Bihar",
}


def _from_prefix(pin: str) -> dict | None:
    state = _PREFIX3.get(pin[:3]) or _PREFIX2.get(pin[:2])
    if not state:
        return None
    district = "Hyderabad" if pin.startswith("500") and int(pin[3:]) <= 110 else None
    return {"pincode": pin, "city": district, "district": district, "state": state, "area": None, "estimated": True}


def lookup(pin: str) -> dict | None:
    pin = (pin or "").strip()
    if len(pin) != 6 or not pin.isdigit() or pin[0] == "0":
        return None
    if pin in _cache:
        return _cache[pin]
    try:
        r = httpx.get(f"https://api.postalpincode.in/pincode/{pin}", timeout=6)
        data = r.json()[0]
        if data.get("Status") != "Success" or not data.get("PostOffice"):
            _cache[pin] = None
            return None
        po = data["PostOffice"][0]
        info = {"pincode": pin, "city": po.get("District") or po.get("Block"), "district": po.get("District"),
                "state": po.get("State"), "area": po.get("Name")}
        _cache[pin] = info
        return info
    except Exception as e:
        log.warning("pincode lookup %s failed, using postal-circle fallback: %s", pin, e)
        info = _from_prefix(pin)
        _cache[pin] = info  # don't wait on a slow upstream again for the same pincode
        return info


def delivery_days(info: dict | None) -> int:
    if not info or not info.get("state"):
        return 6
    if info.get("district") in HYDERABAD_DISTRICTS:
        return 2
    if info["state"] == "Telangana":
        return 3
    if info["state"] in SOUTH:
        return 4
    if info["state"] in FAR:
        return 7
    return 5


def estimate(pin: str) -> dict:
    info = lookup(pin)
    if info is None:
        return {"deliverable": False, "message": "We couldn't find this pincode."}
    days = delivery_days(info)
    eta = datetime.now(timezone.utc) + timedelta(days=days)
    return {
        "deliverable": True, "days": days, "eta": eta.isoformat(), "city": info.get("city"),
        "state": info.get("state"), "area": info.get("area"), "cod_available": days <= 5,
    }
