"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { useAuth } from "./auth";
import { useToast } from "@/components/ui/toast";

type ShopState = {
  bagCount: number;
  wishlist: Set<number>;
  refreshBag: () => Promise<void>;
  addToBag: (productId: number, size: string, qty?: number) => Promise<boolean>;
  toggleWishlist: (productId: number) => Promise<void>;
};

const ShopContext = createContext<ShopState | null>(null);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [bagCount, setBagCount] = useState(0);
  const [wishlist, setWishlist] = useState<Set<number>>(new Set());

  const refreshBag = useCallback(async () => {
    if (!user || user.role !== "customer") {
      setBagCount(0);
      setWishlist(new Set());
      return;
    }
    const [bag, wl] = await Promise.all([api("/api/cart"), api("/api/wishlist")]);
    setBagCount(bag.count);
    setWishlist(new Set(wl.items.map((p: any) => p.id)));
  }, [user]);

  useEffect(() => {
    refreshBag().catch(() => {});
  }, [refreshBag]);

  const requireLogin = () => {
    if (user?.role === "customer") return true;
    router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    return false;
  };

  const addToBag = async (productId: number, size: string, qty = 1) => {
    if (!requireLogin()) return false;
    try {
      const bag = await api("/api/cart", { method: "POST", body: { product_id: productId, size, qty } });
      setBagCount(bag.count);
      toast.success("Added to bag");
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    }
  };

  const toggleWishlist = async (productId: number) => {
    if (!requireLogin()) return;
    const has = wishlist.has(productId);
    const next = new Set(wishlist);
    has ? next.delete(productId) : next.add(productId);
    setWishlist(next);
    try {
      await api(`/api/wishlist/${productId}`, { method: has ? "DELETE" : "POST" });
      toast.success(has ? "Removed from wishlist" : "Saved to wishlist");
    } catch (e: any) {
      setWishlist(wishlist);
      toast.error(e.message);
    }
  };

  return (
    <ShopContext.Provider value={{ bagCount, wishlist, refreshBag, addToBag, toggleWishlist }}>
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop outside ShopProvider");
  return ctx;
}
