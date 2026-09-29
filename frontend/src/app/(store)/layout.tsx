import { ShopProvider } from "@/lib/shop";
import { Header } from "@/components/store/Header";
import { Footer } from "@/components/store/Footer";
import { ChatWidget } from "@/components/store/ChatWidget";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopProvider>
      <Header />
      <main className="min-h-[60vh]">{children}</main>
      <Footer />
      <ChatWidget />
    </ShopProvider>
  );
}
