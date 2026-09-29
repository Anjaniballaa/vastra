import time

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from ..catalog_config import SIZE_CHARTS
from ..db import get_db
from ..models import Banner, Order, OrderItem, Product, ProductVariant, Review, User
from ..security import current_user
from ..services import memory, pincode

router = APIRouter(prefix="/api", tags=["catalog"])
_home_cache: dict = {"at": 0, "data": None}

SORTS = {
    "popularity": Product.rating_count.desc(),
    "discount": Product.discount_pct.desc(),
    "price_asc": Product.price.asc(),
    "price_desc": Product.price.desc(),
    "rating": Product.rating.desc(),
    "new": Product.id.desc(),
}


def card(p: Product) -> dict:
    return {"id": p.id, "name": p.name, "title": p.title, "brand": p.brand, "price": p.price, "mrp": p.mrp,
            "discount_pct": p.discount_pct, "rating": p.rating, "rating_count": p.rating_count,
            "image": p.images[0] if p.images else None, "images": p.images[:2], "gender": p.gender,
            "category": p.category, "category_name": p.category_name, "color": p.color,
            "in_stock": any(v.stock > 0 for v in p.variants), "sizes": [v.size for v in p.variants if v.stock > 0]}


def _apply_filters(q, *, gender=None, category=None, master=None, brand=None, color=None, size=None,
                   min_price=None, max_price=None, min_discount=None, search=None):
    q = q.filter(Product.is_active.is_(True))
    if search:
        for word in search.split()[:6]:
            like = f"%{word}%"
            q = q.filter(or_(Product.name.ilike(like), Product.title.ilike(like), Product.brand.ilike(like),
                             Product.category_name.ilike(like), Product.color.ilike(like), Product.gender.ilike(like)))
    if gender:
        q = q.filter(Product.gender.in_(gender.split(",")))
    if category:
        q = q.filter(Product.category.in_(category.split(",")))
    if master:
        q = q.filter(Product.master_category == master)
    if brand:
        q = q.filter(Product.brand.in_(brand.split("|")))
    if color:
        q = q.filter(Product.color.in_(color.split(",")))
    if size:
        q = q.filter(Product.variants.any((ProductVariant.size.in_(size.split(","))) & (ProductVariant.stock > 0)))
    if min_price is not None:
        q = q.filter(Product.price >= min_price)
    if max_price is not None:
        q = q.filter(Product.price <= max_price)
    if min_discount:
        q = q.filter(Product.discount_pct >= min_discount)
    return q


@router.get("/home")
def home(db: Session = Depends(get_db)):
    if _home_cache["data"] and time.time() - _home_cache["at"] < 120:
        return _home_cache["data"]
    # One pass over the active catalogue (a few thousand rows) instead of a query per category/brand.
    everything = (db.query(Product).options(selectinload(Product.variants)).filter(Product.is_active.is_(True))
                  .order_by(Product.rating_count.desc()).all())
    cat_map: dict[str, dict] = {}
    brand_map: dict[str, dict] = {}
    for p in everything:  # already sorted by popularity, so the first product seen is the cover image
        c = cat_map.setdefault(p.category, {"slug": p.category, "name": p.category_name, "master": p.master_category,
                                            "count": 0, "max_discount": 0, "image": p.images[0] if p.images else None})
        c["count"] += 1
        c["max_discount"] = max(c["max_discount"], p.discount_pct)
        b = brand_map.setdefault(p.brand, {"brand": p.brand, "count": 0, "max_discount": 0, "popularity": 0,
                                           "image": p.images[0] if p.images else None})
        b["count"] += 1
        b["max_discount"] = max(b["max_discount"], p.discount_pct)
        b["popularity"] += p.rating_count
    categories = sorted(cat_map.values(), key=lambda c: -c["count"])
    brand_cards = sorted(brand_map.values(), key=lambda b: -b["popularity"])[:12]
    deals = sorted([p for p in everything if p.rating_count >= 50], key=lambda p: -p.discount_pct)[:12]
    trending = everything[:12]
    banners = db.query(Banner).filter_by(is_active=True).order_by(Banner.sort).all()
    hero = [{"title": b.title, "subtitle": b.subtitle, "image": b.image_url, "link": b.link} for b in banners]
    if not hero:  # fall back to live deals by category
        for c in sorted(categories, key=lambda c: -c["max_discount"])[:4]:
            hero.append({"title": f"{c['name']}", "subtitle": f"Up to {c['max_discount']}% off · {c['count']} styles",
                         "image": c["image"], "link": f"/shop?category={c['slug']}"})
    data = {"hero": hero, "categories": categories, "brands": brand_cards,
            "deals": [card(p) for p in deals], "trending": [card(p) for p in trending]}
    _home_cache.update(at=time.time(), data=data)
    return data


@router.get("/products")
def products(q: str | None = None, gender: str | None = None, category: str | None = None, master: str | None = None,
             brand: str | None = None, color: str | None = None, size: str | None = None,
             min_price: float | None = None, max_price: float | None = None, min_discount: int | None = None,
             sort: str = "popularity", page: int = Query(1, ge=1), page_size: int = Query(40, le=80),
             db: Session = Depends(get_db)):
    base_filters = dict(gender=gender, category=category, master=master, search=q)
    query = _apply_filters(db.query(Product), **base_filters, brand=brand, color=color, size=size,
                           min_price=min_price, max_price=max_price, min_discount=min_discount)
    total = query.count()
    rows = (query.options(selectinload(Product.variants)).order_by(SORTS.get(sort, SORTS["popularity"]), Product.id)
            .offset((page - 1) * page_size).limit(page_size).all())

    facet_base = _apply_filters(db.query(Product), **base_filters)
    def facet(col, limit=40):
        return [{"value": v, "count": c} for v, c in facet_base.with_entities(col, func.count(Product.id))
                .filter(col.isnot(None)).group_by(col).order_by(func.count(Product.id).desc()).limit(limit).all()]
    sizes = (facet_base.join(ProductVariant).with_entities(ProductVariant.size, func.count(func.distinct(Product.id)))
             .filter(ProductVariant.stock > 0).group_by(ProductVariant.size).all())
    price_range = facet_base.with_entities(func.min(Product.price), func.max(Product.price)).first()
    return {
        "total": total, "page": page, "page_size": page_size, "items": [card(p) for p in rows],
        "facets": {"gender": facet(Product.gender), "category": [
            {"value": v, "label": l, "count": c} for v, l, c in facet_base.with_entities(
                Product.category, Product.category_name, func.count(Product.id)).group_by(
                Product.category, Product.category_name).order_by(func.count(Product.id).desc()).all()],
            "brand": facet(Product.brand, 60), "color": facet(Product.color),
            "size": [{"value": s, "count": c} for s, c in sizes],
            "price": {"min": price_range[0] or 0, "max": price_range[1] or 0}},
    }


@router.get("/search/suggest")
def suggest(q: str, db: Session = Depends(get_db)):
    q = q.strip()
    if len(q) < 2:
        return {"suggestions": []}
    like = f"%{q}%"
    out = []
    for slug, name in (db.query(Product.category, Product.category_name).filter(Product.category_name.ilike(like))
                       .distinct().limit(4).all()):
        out.append({"type": "category", "label": name, "href": f"/shop?category={slug}"})
    for (b,) in db.query(Product.brand).filter(Product.brand.ilike(like)).distinct().limit(5).all():
        out.append({"type": "brand", "label": b, "href": f"/shop?brand={b}"})
    for p in (db.query(Product).filter(Product.is_active.is_(True), or_(Product.title.ilike(like), Product.name.ilike(like)))
              .order_by(Product.rating_count.desc()).limit(6).all()):
        out.append({"type": "product", "label": f"{p.brand} {p.name}", "href": f"/product/{p.id}", "image": p.images[0] if p.images else None})
    return {"suggestions": out}


@router.get("/products/{pid}")
def product_detail(pid: int, db: Session = Depends(get_db)):
    p = db.query(Product).options(selectinload(Product.variants)).get(pid)
    if not p or not p.is_active:
        raise HTTPException(404, "Product not found")
    similar = (db.query(Product).options(selectinload(Product.variants))
               .filter(Product.category == p.category, Product.gender == p.gender, Product.id != p.id, Product.is_active.is_(True))
               .order_by(func.abs(Product.price - p.price)).limit(12).all())
    reviews = db.query(Review).filter_by(product_id=p.id).order_by(Review.id.desc()).limit(30).all()
    fit = dict(db.query(Review.fit, func.count(Review.id)).filter(Review.product_id == p.id, Review.fit.isnot(None))
               .group_by(Review.fit).all())
    more_brand = (db.query(Product).options(selectinload(Product.variants))
                  .filter(Product.brand == p.brand, Product.id != p.id, Product.is_active.is_(True))
                  .order_by(Product.rating_count.desc()).limit(8).all())
    d = card(p)
    d.update({
        "images": p.images, "details": p.details, "master_category": p.master_category, "size_type": p.size_type,
        "variants": [{"size": v.size, "stock": v.stock} for v in p.variants],
        "size_chart": SIZE_CHARTS.get(p.size_type),
        "similar": [card(x) for x in similar], "more_from_brand": [card(x) for x in more_brand],
        "reviews": [{"id": r.id, "rating": r.rating, "title": r.title, "body": r.body, "fit": r.fit,
                     "author": r.user.name.split()[0], "created_at": r.created_at} for r in reviews],
        "verified_rating": round(sum(r.rating for r in reviews) / len(reviews), 1) if reviews else None,
        "fit_summary": fit,
    })
    return d


@router.get("/policies")
def policies(db: Session = Depends(get_db)):
    from ..services.settings import get_setting
    return get_setting(db, "policies")


@router.get("/pincode/{pin}")
def check_pincode(pin: str):
    return pincode.estimate(pin)


class ReviewIn(BaseModel):
    order_item_id: int
    rating: int = Field(ge=1, le=5)
    title: str | None = None
    body: str | None = None
    fit: str | None = None


@router.post("/products/{pid}/reviews")
def add_review(pid: int, body: ReviewIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(OrderItem, body.order_item_id)
    if not item or item.product_id != pid:
        raise HTTPException(400, "You can only review products you bought")
    order = db.get(Order, item.order_id)
    if order.user_id != user.id or item.status not in ("delivered", "returned", "exchanged"):
        raise HTTPException(400, "You can review this product after it's delivered")
    if db.query(Review).filter_by(user_id=user.id, order_item_id=item.id).first():
        raise HTTPException(400, "You already reviewed this item")
    r = Review(product_id=pid, user_id=user.id, order_item_id=item.id, rating=body.rating, title=body.title,
               body=body.body, fit=body.fit if body.fit in ("small", "true", "large") else None)
    db.add(r)
    db.commit()
    if body.fit and body.fit != "true":
        memory.in_background(memory.retain_customer, user.id,
                             f"{user.name} said {item.brand} {item.name} in size {item.size} runs {body.fit}.",
                             "product review", ["fit"], user.name)
    return {"ok": True, "id": r.id}
