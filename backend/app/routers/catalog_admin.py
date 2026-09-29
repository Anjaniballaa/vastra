"""Catalog manager: products, stock, prices, coupons, banners."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import Banner, Coupon, Product, ProductVariant, User
from ..security import require_roles
from ..services.audit import audit
from . import catalog as catalog_router

router = APIRouter(prefix="/api/catalog-admin", tags=["catalog-admin"])
cat = require_roles("catalog")


def _bust_cache():
    catalog_router._home_cache["at"] = 0


@router.get("/products")
def products(q: str | None = None, low_stock: bool = False, page: int = 1, user: User = Depends(cat),
             db: Session = Depends(get_db)):
    query = db.query(Product).options(selectinload(Product.variants))
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Product.name.ilike(like), Product.brand.ilike(like), Product.title.ilike(like),
                                 Product.category_name.ilike(like)))
    if low_stock:
        query = query.filter(Product.variants.any(ProductVariant.stock <= 3))
    total = query.count()
    rows = query.order_by(Product.id).offset((page - 1) * 50).limit(50).all()
    return {"total": total, "items": [{
        "id": p.id, "name": p.name, "brand": p.brand, "category_name": p.category_name, "gender": p.gender,
        "price": p.price, "mrp": p.mrp, "discount_pct": p.discount_pct, "is_active": p.is_active,
        "image": p.images[0] if p.images else None,
        "variants": [{"size": v.size, "stock": v.stock} for v in p.variants]} for p in rows]}


class ProductPatch(BaseModel):
    price: float | None = None
    mrp: float | None = None
    is_active: bool | None = None
    name: str | None = None
    stock: dict[str, int] | None = None


@router.patch("/products/{pid}")
def patch_product(pid: int, body: ProductPatch, user: User = Depends(cat), db: Session = Depends(get_db)):
    p = db.get(Product, pid)
    if not p:
        raise HTTPException(404, "Product not found")
    changes = []
    if body.mrp is not None:
        p.mrp = body.mrp
        changes.append(f"mrp={body.mrp}")
    if body.price is not None:
        if body.price > p.mrp:
            raise HTTPException(400, "Price can't exceed MRP")
        p.price = body.price
        changes.append(f"price={body.price}")
    p.discount_pct = int(round((1 - p.price / p.mrp) * 100)) if p.mrp else 0
    if body.is_active is not None:
        p.is_active = body.is_active
        changes.append(f"active={body.is_active}")
    if body.name:
        p.name = body.name
    for size, stock in (body.stock or {}).items():
        v = next((v for v in p.variants if v.size == size), None)
        if v:
            v.stock = max(0, int(stock))
            changes.append(f"{size}:{stock}")
    audit(db, user, "product.update", f"product:{p.id}", ", ".join(changes))
    db.commit()
    _bust_cache()
    return {"ok": True}


class CouponIn(BaseModel):
    code: str
    description: str
    kind: str = "percent"
    value: float
    min_order: float = 0
    max_discount: float | None = None
    max_item_discount_pct: int | None = None
    first_order_only: bool = False
    usage_limit: int | None = None
    valid_to: datetime | None = None
    is_active: bool = True


def coupon_out(c: Coupon) -> dict:
    return {k: getattr(c, k) for k in ("id", "code", "description", "kind", "value", "min_order", "max_discount",
                                       "max_item_discount_pct", "first_order_only", "usage_limit", "used_count",
                                       "valid_to", "is_active", "created_at")}


@router.get("/coupons")
def coupons(user: User = Depends(cat), db: Session = Depends(get_db)):
    return {"items": [coupon_out(c) for c in db.query(Coupon).order_by(Coupon.id.desc()).all()]}


@router.post("/coupons")
def create_coupon(body: CouponIn, user: User = Depends(cat), db: Session = Depends(get_db)):
    code = body.code.strip().upper()
    if db.query(Coupon).filter_by(code=code).first():
        raise HTTPException(400, "A coupon with this code exists")
    c = Coupon(**{**body.model_dump(), "code": code})
    db.add(c)
    audit(db, user, "coupon.create", code, body.description)
    db.commit()
    return coupon_out(c)


@router.put("/coupons/{cid}")
def update_coupon(cid: int, body: CouponIn, user: User = Depends(cat), db: Session = Depends(get_db)):
    c = db.get(Coupon, cid)
    if not c:
        raise HTTPException(404, "Coupon not found")
    for k, v in body.model_dump().items():
        setattr(c, k, v.strip().upper() if k == "code" else v)
    audit(db, user, "coupon.update", c.code)
    db.commit()
    return coupon_out(c)


class BannerIn(BaseModel):
    title: str
    subtitle: str | None = None
    image_url: str
    link: str = "/shop"
    sort: int = 0
    is_active: bool = True


@router.get("/banners")
def banners(user: User = Depends(cat), db: Session = Depends(get_db)):
    return {"items": [{k: getattr(b, k) for k in ("id", "title", "subtitle", "image_url", "link", "sort", "is_active")}
                      for b in db.query(Banner).order_by(Banner.sort).all()]}


@router.post("/banners")
def create_banner(body: BannerIn, user: User = Depends(cat), db: Session = Depends(get_db)):
    b = Banner(**body.model_dump())
    db.add(b)
    audit(db, user, "banner.create", body.title)
    db.commit()
    _bust_cache()
    return {"id": b.id}


@router.put("/banners/{bid}")
def update_banner(bid: int, body: BannerIn, user: User = Depends(cat), db: Session = Depends(get_db)):
    b = db.get(Banner, bid)
    for k, v in body.model_dump().items():
        setattr(b, k, v)
    db.commit()
    _bust_cache()
    return {"ok": True}


@router.delete("/banners/{bid}")
def delete_banner(bid: int, user: User = Depends(cat), db: Session = Depends(get_db)):
    db.query(Banner).filter_by(id=bid).delete()
    db.commit()
    _bust_cache()
    return {"ok": True}
