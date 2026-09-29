"""Store catalog configuration: which dataset categories Vastra sells, and their size systems."""

# dataset category slug -> (display name, master category, size type)
CATEGORIES: dict[str, tuple[str, str, str]] = {
    "tshirts": ("T-Shirts", "Topwear", "alpha"),
    "shirts": ("Shirts", "Topwear", "alpha"),
    "tops": ("Tops", "Topwear", "alpha"),
    "sweatshirts": ("Sweatshirts", "Topwear", "alpha"),
    "jackets": ("Jackets", "Topwear", "alpha"),
    "kurtas": ("Kurtas", "Ethnic Wear", "alpha"),
    "kurta-sets": ("Kurta Sets", "Ethnic Wear", "alpha"),
    "sarees": ("Sarees", "Ethnic Wear", "onesize"),
    "dresses": ("Dresses", "Western Wear", "alpha"),
    "jeans": ("Jeans", "Bottomwear", "waist"),
    "trousers": ("Trousers", "Bottomwear", "waist"),
    "shorts": ("Shorts", "Bottomwear", "alpha"),
    "track-pants": ("Track Pants", "Bottomwear", "alpha"),
    "night-suits": ("Night Suits", "Sleep & Lounge", "alpha"),
    "sports-shoes": ("Sports Shoes", "Footwear", "shoe"),
    "casual-shoes": ("Casual Shoes", "Footwear", "shoe"),
    "heels": ("Heels", "Footwear", "shoe_w"),
    "flats": ("Flats", "Footwear", "shoe_w"),
    "watches": ("Watches", "Accessories", "onesize"),
    "sunglasses": ("Sunglasses", "Accessories", "onesize"),
    "backpacks": ("Backpacks", "Accessories", "onesize"),
    "handbags": ("Handbags", "Accessories", "onesize"),
    "earrings": ("Earrings", "Jewellery", "onesize"),
    "jewellery-set": ("Jewellery Sets", "Jewellery", "onesize"),
    "perfume-and-body-mist": ("Perfumes", "Beauty", "onesize"),
    "lipstick": ("Lipstick", "Beauty", "onesize"),
}

SIZE_SYSTEMS: dict[str, list[str]] = {
    "alpha": ["XS", "S", "M", "L", "XL", "XXL"],
    "waist": ["28", "30", "32", "34", "36", "38"],
    "shoe": ["UK6", "UK7", "UK8", "UK9", "UK10", "UK11"],
    "shoe_w": ["UK3", "UK4", "UK5", "UK6", "UK7", "UK8"],
    "onesize": ["Onesize"],
}

# Vastra's published size charts (inches / foot length in cm)
SIZE_CHARTS: dict[str, dict] = {
    "alpha": {
        "columns": ["Size", "Chest (in)", "Waist (in)", "Length (in)"],
        "rows": [["XS", "34", "28", "26"], ["S", "36", "30", "27"], ["M", "38", "32", "28"],
                 ["L", "40", "34", "29"], ["XL", "42", "36", "30"], ["XXL", "44", "38", "31"]],
    },
    "waist": {
        "columns": ["Size", "Waist (in)", "Hip (in)", "Inseam (in)"],
        "rows": [["28", "28", "36", "30"], ["30", "30", "38", "30"], ["32", "32", "40", "31"],
                 ["34", "34", "42", "31"], ["36", "36", "44", "32"], ["38", "38", "46", "32"]],
    },
    "shoe": {
        "columns": ["UK", "EU", "Foot length (cm)"],
        "rows": [["UK6", "40", "25.0"], ["UK7", "41", "25.8"], ["UK8", "42", "26.5"],
                 ["UK9", "43", "27.3"], ["UK10", "44", "28.1"], ["UK11", "45", "29.0"]],
    },
    "shoe_w": {
        "columns": ["UK", "EU", "Foot length (cm)"],
        "rows": [["UK3", "36", "22.5"], ["UK4", "37", "23.2"], ["UK5", "38", "24.0"],
                 ["UK6", "39", "24.8"], ["UK7", "40", "25.5"], ["UK8", "41", "26.3"]],
    },
    "onesize": {"columns": ["Size"], "rows": [["Onesize"]]},
}

COLORS = [
    "off-white", "navy-blue", "sea-green", "olive-green", "mint-green", "lime-green", "teal",
    "black", "white", "grey", "charcoal", "blue", "red", "maroon", "burgundy", "green", "olive",
    "yellow", "mustard", "orange", "peach", "coral", "pink", "magenta", "purple", "lavender",
    "violet", "brown", "tan", "beige", "cream", "khaki", "gold", "silver", "rust", "turquoise",
    "multi", "nude", "copper", "bronze", "rose-gold",
]

FABRICS = ["cotton", "linen", "polyester", "denim", "silk", "rayon", "viscose", "leather", "wool",
           "chiffon", "georgette", "satin", "velvet", "nylon", "fleece", "modal", "lycra", "canvas", "mesh"]
FITS = ["slim", "regular", "oversized", "loose", "relaxed", "skinny", "straight", "tapered", "boxy", "bootcut", "wide-leg"]
PATTERNS = ["solid", "printed", "striped", "checked", "embroidered", "self-design", "colourblocked",
            "graphic", "floral", "typography", "washed", "textured", "ethnic-motifs"]
