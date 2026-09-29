import { api } from "./api";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

function loadScript(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the payment window. Check your connection."));
    document.body.appendChild(s);
  });
}

/** Opens Razorpay Checkout; resolves true when payment is verified by our server. */
export async function payWithRazorpay(orderCode: string, payment: any): Promise<boolean> {
  await loadScript();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: payment.key,
      order_id: payment.order_id,
      amount: payment.amount,
      currency: payment.currency,
      name: "Vastra",
      description: `Order ${orderCode}`,
      prefill: payment.prefill,
      theme: { color: "#3f3289" },
      handler: async (resp: any) => {
        try {
          await api(`/api/orders/${orderCode}/verify-payment`, { method: "POST", body: resp });
          resolve(true);
        } catch (e) {
          reject(e);
        }
      },
      modal: { ondismiss: () => resolve(false) },
    });
    rzp.on("payment.failed", (resp: any) => {
      api(`/api/orders/${orderCode}/payment-failed`, {
        method: "POST",
        body: { reason: `${resp.error?.description || "failed"} (${resp.error?.reason || resp.error?.code || ""})` },
      }).catch(() => {});
    });
    rzp.open();
  });
}
