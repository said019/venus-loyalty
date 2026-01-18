import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminTopbar from "@/components/admin/AdminTopbar";
import DashboardPanel from "@/components/admin/panels/DashboardPanel";
import CardsPanel from "@/components/admin/panels/CardsPanel";
import GiftCardsPanel from "@/components/admin/panels/GiftCardsPanel";
import CatalogPanel from "@/components/admin/panels/CatalogPanel";
import ReportsPanel from "@/components/admin/panels/ReportsPanel";
import SettingsPanel from "@/components/admin/panels/SettingsPanel";
import AppointmentsPanel from "@/components/admin/panels/AppointmentsPanel";
import RequestsPanel from "@/components/admin/panels/RequestsPanel";
import NotificationsPanel from "@/components/admin/panels/NotificationsPanel";

export type AdminTab = "dashboard" | "requests" | "appointments" | "cards" | "notifications" | "giftcards" | "catalog" | "reports" | "settings";

const Admin = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderPanel = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardPanel />;
      case "requests":
        return <RequestsPanel />;
      case "appointments":
        return <AppointmentsPanel />;
      case "cards":
        return <CardsPanel />;
      case "notifications":
        return <NotificationsPanel />;
      case "giftcards":
        return <GiftCardsPanel />;
      case "catalog":
        return <CatalogPanel />;
      case "reports":
        return <ReportsPanel />;
      case "settings":
        return <SettingsPanel />;
      default:
        return <DashboardPanel />;
    }
  };

  return (
    <div className="min-h-screen bg-venus-forest dark">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AdminSidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="lg:pl-64">
        <AdminTopbar onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="p-4 md:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderPanel()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default Admin;
