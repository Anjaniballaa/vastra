"""Import real products from the Kaggle Myntra dataset (CC0) into Vastra.

Usage:
    python -m scripts.import_catalog --zip PATH_TO_myntra.zip --per-category 60

Picks the most-rated products per category (brand-diversified), re-hosts the
product images on Cloudinary and creates products with per-size stock.
"""
import argparse
import heapq
import io
import re
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cloudinary
import cloudinary.uploader
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config  # noqa: E402
from app.catalog_config import CATEGORIES, COLORS, FABRICS, FITS, PATTERNS, SIZE_SYSTEMS  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.models import Product, ProductVariant  # noqa: E402

INITIAL_STOCK_PER_SIZE = 25
MAX_PER_BRAND = 8
TRANSFORM_RE = re.compile(r"assets\.myntassets\.com/[^/]*,[^/]*/")


def clean_image_urls(raw: str) -> list[str]:
    seen, out = set(), []
    for part in str(raw).replace("\n", ";").split(";"):
        u = part.strip()
        if not u.startswith("http"):
            continue
        u = TRANSFORM_RE.sub("assets.myntassets.com/", u)
        key = u.split("assets/images/")[-1]
        if key not in seen:
            seen.add(key)
            out.append(u)
    return out


def parse_gender(name: str, slug: str) -> str:
    first = name.split(" ")[0].lower()
    mapping = {"men": "Men", "women": "Women", "boys": "Boys", "girls": "Girls", "unisex": "Unisex"}
    if first in mapping:
        return mapping[first]
    tokens = slug.split("-")
    for t in ("women", "men", "girls", "boys", "unisex"):
        if t in tokens:
            return mapping[t]
    return "Unisex"


def find_token(slug: str, options: list[str]) -> str | None:
    s = f"-{slug}-"
    for o in options:
        if f"-{o}-" in s:
            return o
    return None


def pretty(slug_part: str) -> str:
    words = slug_part.replace("-", " ").split()
    text = " ".join(w.capitalize() for w in words)
    return text.replace("T Shirt", "T-Shirt").replace("Tshirt", "T-Shirt")


def build_row(r) -> dict | None:
    parts = str(r.purl).split("/")
    if len(parts) < 7:
        return None
    cat, brand_slug, prod_slug = parts[3], parts[4], parts[5]
    if cat not in CATEGORIES:
        return None
    images = clean_image_urls(r.img)
    if not images or not isinstance(r.seller, str):
        return None
    price, mrp = float(r.price), float(r.mrp)
    if price <= 0 or mrp <= 0 or price > mrp or price > 60000:
        return None
    title_slug = prod_slug[len(brand_slug) + 1:] if prod_slug.startswith(brand_slug + "-") else prod_slug
    color = find_token(prod_slug, COLORS)
    details = []
    for label, opts in (("Fabric", FABRICS), ("Fit", FITS), ("Pattern", PATTERNS)):
        v = find_token(prod_slug, opts)
        if v:
            details.append(f"{label}: {pretty(v)}")
    if color:
        details.append(f"Colour: {pretty(color)}")
    return {
        "source_id": str(parts[6]),
        "name": str(r.name).strip()[:255],
        "title": pretty(title_slug)[:400],
        "brand": r.seller.strip()[:120],
        "category": cat,
        "gender": parse_gender(str(r.name), prod_slug),
        "color": pretty(color) if color else None,
        "price": round(price),
        "mrp": round(mrp),
        "discount_pct": int(round((1 - price / mrp) * 100)),
        "rating": float(r.rating or 0),
        "rating_count": int(r.ratingTotal or 0),
        "source_images": images[:3],
        "details": details,
    }


def select_products(zip_path: str, per_category: int) -> list[dict]:
    pools: dict[str, list] = {c: [] for c in CATEGORIES}
    counter = 0
    with zipfile.ZipFile(zip_path) as z:
        name = z.namelist()[0]
        with z.open(name) as f:
            for chunk in pd.read_csv(io.TextIOWrapper(f, encoding="utf-8", errors="replace"), chunksize=100_000):
                for r in chunk.itertuples(index=False):
                    row = build_row(r)
                    if not row:
                        continue
                    counter += 1
                    pool = pools[row["category"]]
                    item = (row["rating_count"], counter, row)
                    if len(pool) < per_category * 8:
                        heapq.heappush(pool, item)
                    else:
                        heapq.heappushpop(pool, item)
                print(f"  scanned chunk; candidates so far: {sum(len(p) for p in pools.values())}")
    selected = []
    for cat, pool in pools.items():
        brand_count: dict[str, int] = {}
        seen_names = set()
        for _, _, row in sorted(pool, key=lambda x: -x[0]):
            if brand_count.get(row["brand"], 0) >= MAX_PER_BRAND:
                continue
            key = (row["brand"], row["title"])
            if key in seen_names:
                continue
            seen_names.add(key)
            brand_count[row["brand"]] = brand_count.get(row["brand"], 0) + 1
            selected.append(row)
            if brand_count and sum(brand_count.values()) >= per_category:
                break
        print(f"  {cat}: {sum(brand_count.values())}")
    return selected


def upload_images(row: dict) -> list[str]:
    urls = []
    for i, src in enumerate(row["source_images"]):
        try:
            res = cloudinary.uploader.upload(
                src, folder="vastra/products", public_id=f"{row['source_id']}_{i}",
                overwrite=False, resource_type="image",
            )
            urls.append(res["secure_url"])
        except Exception as e:  # keep going; a product needs at least one image
            print(f"    image failed {row['source_id']}_{i}: {e}")
    return urls


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", required=True)
    ap.add_argument("--per-category", type=int, default=60)
    ap.add_argument("--workers", type=int, default=12)
    args = ap.parse_args()

    cloudinary.config(
        cloud_name=config.CLOUDINARY_CLOUD_NAME, api_key=config.CLOUDINARY_API_KEY,
        api_secret=config.CLOUDINARY_API_SECRET, secure=True,
    )
    Base.metadata.create_all(engine)

    print("Selecting products from dataset...")
    rows = select_products(args.zip, args.per_category)
    db = SessionLocal()
    existing = {s for (s,) in db.query(Product.source_id).all()}
    rows = [r for r in rows if r["source_id"] not in existing]
    print(f"Uploading images for {len(rows)} new products...")

    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for row, urls in zip(rows, pool.map(upload_images, rows)):
            done += 1
            if not urls:
                continue
            name, master, size_type = CATEGORIES[row["category"]]
            p = Product(
                source_id=row["source_id"], name=row["name"], title=row["title"], brand=row["brand"],
                category=row["category"], category_name=name, master_category=master, gender=row["gender"],
                color=row["color"], price=row["price"], mrp=row["mrp"], discount_pct=row["discount_pct"],
                rating=row["rating"], rating_count=row["rating_count"], images=urls, details=row["details"],
                size_type=size_type,
            )
            for i, size in enumerate(SIZE_SYSTEMS[size_type]):
                p.variants.append(ProductVariant(size=size, stock=INITIAL_STOCK_PER_SIZE, sort=i))
            db.add(p)
            if done % 50 == 0:
                db.commit()
                print(f"  {done}/{len(rows)}")
    db.commit()
    print("Total products:", db.query(Product).count())
    db.close()


if __name__ == "__main__":
    main()
