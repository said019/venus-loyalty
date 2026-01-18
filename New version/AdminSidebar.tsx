import { motion } from "framer-motion";
import { 
  LayoutDashboard, 
  CreditCard, 
  Gift, 
  Sparkles, 
  BarChart3, 
  Settings,
  Calendar,
  X,
  Bell
} from "lucide-react";
import { AdminTab } from "@/pages/Admin";
import venusLogo from "@/assets/venus-logo.png";

interface AdminSidebarProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  isOpen: boolean;
  onClose: () => void;
}

import { Send } from "lucide-react";

const navItems: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
  { id: "requests", label: "Solicitudes", icon: <Bell size={20} />, badge: 7 },
  { id: "appointments", label: "Citas", icon: <Calendar size={20} /> },
  { id: "cards", label: "Tarjetas", icon: <CreditCard size={20} /> },
  { id: "notifications", label: "Notificaciones", icon: <Send size={20} /> },
  { id: "giftcards", label: "Gift Cards", icon: <Gift size={20} /> },
  { id: "catalog", label: "Catálogo", icon: <Sparkles size={20} /> },
  { id: "reports", label: "Reportes", icon: <BarChart3 size={20} /> },
  { id: "settings", label: "Configuración", icon: <Settings size={20} /> },
];

const AdminSidebar = ({ activeTab, setActiveTab, isOpen, onClose }: AdminSidebarProps) => {
  return (
    <aside
      className={`fixed top-0 left-0 h-full w-64 bg-gradient-to-b from-[#1a2f1a] to-[#0d1f0d] border-r border-white/10 z-50 transform transition-transform duration-300 ease-out lg:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Close button for mobile */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/60 hover:text-white lg:hidden"
      >
        <X size={20} />
      </button>

      {/* Brand */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <img src={venusLogo} alt="Venus" className="w-10 h-10 rounded-xl shadow-lg" />
          <div>
            <h1 className="text-white font-semibold text-lg font-playfair">Venus</h1>
            <p className="text-white/40 text-xs">Panel Admin</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              onClose();
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeTab === item.id
                ? "bg-primary/20 text-primary-foreground"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            {item.icon}
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge && item.badge > 0 && (
              <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                {item.badge}
              </span>
            )}
            {activeTab === item.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute left-0 w-1 h-8 bg-primary rounded-r-full"
              />
            )}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-primary text-sm font-semibold">A</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">Admin</p>
            <p className="text-white/40 text-xs truncate">Administrador</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default AdminSidebar;
