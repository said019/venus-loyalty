import { Bell, Menu, Moon, Sun, LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AdminTopbarProps {
  onMenuClick: () => void;
}

const AdminTopbar = ({ onMenuClick }: AdminTopbarProps) => {
  const [isDark, setIsDark] = useState(true);
  const [notifications] = useState([
    { id: 1, type: "cita", title: "Nueva cita", message: "María García - Facial Premium", time: "Hace 5 min" },
    { id: 2, type: "sello", title: "Sello agregado", message: "Laura Pérez completó su tarjeta", time: "Hace 15 min" },
    { id: 3, type: "cumple", title: "Cumpleaños próximo", message: "Ana López cumple en 2 días", time: "Hace 1 hora" },
  ]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-[#0a1a0a]/95 backdrop-blur-xl border-b border-white/10 px-4 flex items-center justify-between gap-4">
      {/* Left side */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="p-2 text-white/60 hover:text-white hover:bg-white/5 rounded-xl lg:hidden"
        >
          <Menu size={20} />
        </button>
        <div>
          <h2 className="text-white font-semibold text-lg font-playfair">¡Hola! 👋</h2>
          <p className="text-white/40 text-xs">Bienvenido al panel de administración</p>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="text-white/60 hover:text-white hover:bg-white/5"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-white/60 hover:text-white hover:bg-white/5"
            >
              <Bell size={18} />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {notifications.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 bg-[#1a1a1a] border-white/10">
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Bell size={16} /> Notificaciones
              </h3>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.map((notif) => (
                <DropdownMenuItem
                  key={notif.id}
                  className="flex items-start gap-3 p-4 cursor-pointer hover:bg-white/5 focus:bg-white/5"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    notif.type === "cita" ? "bg-blue-500/20 text-blue-400" :
                    notif.type === "sello" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-pink-500/20 text-pink-400"
                  }`}>
                    {notif.type === "cita" ? "📅" : notif.type === "sello" ? "⭐" : "🎂"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{notif.title}</p>
                    <p className="text-white/60 text-xs truncate">{notif.message}</p>
                    <p className="text-white/40 text-xs mt-1">{notif.time}</p>
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Logout */}
        <Button
          variant="ghost"
          size="sm"
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-2"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Salir</span>
        </Button>
      </div>
    </header>
  );
};

export default AdminTopbar;
