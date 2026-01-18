import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Store, 
  Clock, 
  MapPin, 
  Phone,
  Save,
  Bell,
  Palette,
  Shield,
  ChevronRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const hours = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const min = i % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, '0')}:${min}`;
});

const days = [
  { id: "lun", label: "Lun" },
  { id: "mar", label: "Mar" },
  { id: "mie", label: "Mié" },
  { id: "jue", label: "Jue" },
  { id: "vie", label: "Vie" },
  { id: "sab", label: "Sáb" },
  { id: "dom", label: "Dom" },
];

const SettingsPanel = () => {
  const [businessName, setBusinessName] = useState("Venus Estética");
  const [whatsapp, setWhatsapp] = useState("524271234567");
  const [address, setAddress] = useState("Cactus 50, San Juan del Río, Querétaro");
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("19:00");
  const [workDays, setWorkDays] = useState(["lun", "mar", "mie", "jue", "vie", "sab"]);

  const toggleDay = (dayId: string) => {
    if (workDays.includes(dayId)) {
      setWorkDays(workDays.filter(d => d !== dayId));
    } else {
      setWorkDays([...workDays, dayId]);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white font-playfair">Configuración</h1>
        <p className="text-white/60 text-sm">Administra los ajustes de tu negocio</p>
      </div>

      {/* Business Config */}
      <Card className="bg-[#1a1a1a] border-primary/20">
        <CardHeader>
          <CardTitle className="text-white font-playfair flex items-center gap-2">
            <Store size={20} className="text-primary" />
            Datos del Negocio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-white/60 text-sm -mt-2">Esta información se muestra en la página de agendar citas.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-white/80 text-sm">Nombre del negocio</Label>
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Venus Estética"
                className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              />
            </div>
            <div>
              <Label className="text-white/80 text-sm">WhatsApp del negocio</Label>
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="524271234567"
                className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              />
              <p className="text-white/40 text-xs mt-1">Formato: código país + número (sin +)</p>
            </div>
          </div>

          <div>
            <Label className="text-white/80 text-sm">Dirección</Label>
            <div className="relative mt-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Escribe tu dirección..."
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-white/80 text-sm">Horario apertura</Label>
              <Select value={openTime} onValueChange={setOpenTime}>
                <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/10 max-h-60">
                  {hours.map(hour => (
                    <SelectItem key={hour} value={hour}>{hour}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white/80 text-sm">Horario cierre</Label>
              <Select value={closeTime} onValueChange={setCloseTime}>
                <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/10 max-h-60">
                  {hours.map(hour => (
                    <SelectItem key={hour} value={hour}>{hour}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-white/80 text-sm mb-3 block">Días de trabajo</Label>
            <div className="flex flex-wrap gap-2">
              {days.map(day => (
                <button
                  key={day.id}
                  onClick={() => toggleDay(day.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    workDays.includes(day.id)
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Save size={16} className="mr-2" />
            Guardar cambios
          </Button>
        </CardContent>
      </Card>

      {/* Other Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-[#1a1a1a] border-white/10 hover:border-white/20 transition-colors cursor-pointer">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-blue-500/20">
                  <Bell size={22} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Notificaciones</h3>
                  <p className="text-white/60 text-sm">Configura alertas y recordatorios</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-white/40" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#1a1a1a] border-white/10 hover:border-white/20 transition-colors cursor-pointer">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-purple-500/20">
                  <Palette size={22} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Apariencia</h3>
                  <p className="text-white/60 text-sm">Personaliza colores y tema</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-white/40" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#1a1a1a] border-white/10 hover:border-white/20 transition-colors cursor-pointer">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-green-500/20">
                  <Shield size={22} className="text-green-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Seguridad</h3>
                  <p className="text-white/60 text-sm">Contraseña y autenticación</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-white/40" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#1a1a1a] border-white/10 hover:border-white/20 transition-colors cursor-pointer">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-amber-500/20">
                  <Clock size={22} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Automatizaciones</h3>
                  <p className="text-white/60 text-sm">Mensajes automáticos</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-white/40" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Module Toggles */}
      <Card className="bg-[#1a1a1a] border-white/10">
        <CardHeader>
          <CardTitle className="text-white font-playfair">Módulos Activos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { id: "loyalty", label: "Tarjetas de Lealtad", icon: "💳", enabled: true },
            { id: "giftcards", label: "Gift Cards", icon: "🎁", enabled: true },
            { id: "appointments", label: "Citas Online", icon: "📅", enabled: true },
            { id: "products", label: "Inventario", icon: "📦", enabled: false },
          ].map(module => (
            <div
              key={module.id}
              className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{module.icon}</span>
                <span className="text-white font-medium">{module.label}</span>
              </div>
              <Switch
                checked={module.enabled}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPanel;
