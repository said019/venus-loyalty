import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Bell, 
  Send, 
  Cake, 
  Moon, 
  Gift, 
  Zap, 
  History, 
  Play, 
  FlaskConical,
  Trash2,
  RefreshCw,
  Smartphone,
  CheckCircle,
  XCircle
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

interface AutomationRule {
  id: string;
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  enabled: boolean;
  config: {
    days?: number;
    stamps?: number;
    message: string;
  };
}

interface NotificationHistory {
  id: number;
  date: string;
  title: string;
  type: string;
  sent: number;
  errors: number;
}

const NotificationsPanel = () => {
  // Push notification form
  const [pushTitle, setPushTitle] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushType, setPushType] = useState("promo");
  const [isSending, setIsSending] = useState(false);

  // Automation rules
  const [automations, setAutomations] = useState<AutomationRule[]>([
    {
      id: "birthday",
      title: "Recordatorio de Cumpleaños",
      icon: <Cake size={18} />,
      iconBg: "bg-pink-500/20 text-pink-400",
      enabled: true,
      config: {
        days: 3,
        message: "¡Feliz cumpleaños! 🎉 Te esperamos con un regalo especial en Venus."
      }
    },
    {
      id: "inactivity",
      title: "Alerta de Inactividad",
      icon: <Moon size={18} />,
      iconBg: "bg-purple-500/20 text-purple-400",
      enabled: true,
      config: {
        days: 30,
        message: "¡Te extrañamos! 😊 Hace tiempo que no te vemos. Ven y disfruta nuestros servicios."
      }
    },
    {
      id: "completed",
      title: "Tarjeta Completada",
      icon: <Gift size={18} />,
      iconBg: "bg-green-500/20 text-green-400",
      enabled: true,
      config: {
        message: "¡Felicidades! 🎁 Has completado tu tarjeta. Ven a canjear tu premio."
      }
    },
    {
      id: "almost",
      title: "Casi Completa (Motivacional)",
      icon: <Zap size={18} />,
      iconBg: "bg-yellow-500/20 text-yellow-400",
      enabled: true,
      config: {
        stamps: 2,
        message: "¡Ya casi! ⚡ Solo te faltan [X] sellos para tu premio. ¡No esperes más!"
      }
    }
  ]);

  // Notification history
  const [history] = useState<NotificationHistory[]>([
    { id: 1, date: "2024-01-15 14:30", title: "Promoción Enero", type: "promo", sent: 145, errors: 2 },
    { id: 2, date: "2024-01-14 10:00", title: "Recordatorio citas", type: "reminder", sent: 23, errors: 0 },
    { id: 3, date: "2024-01-12 18:15", title: "Cumpleaños - María", type: "birthday", sent: 1, errors: 0 },
  ]);

  const typeLabels: Record<string, { label: string; emoji: string }> = {
    promo: { label: "Promoción", emoji: "🎁" },
    reminder: { label: "Recordatorio", emoji: "⏰" },
    update: { label: "Actualización", emoji: "📢" },
    alert: { label: "Alerta", emoji: "⚠️" },
    birthday: { label: "Cumpleaños", emoji: "🎂" },
  };

  const handleSendPush = async (isTest: boolean) => {
    if (!pushTitle.trim() || !pushMessage.trim()) {
      toast({
        title: "Error",
        description: "Por favor completa el título y mensaje",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    // Simulate sending
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsSending(false);

    toast({
      title: isTest ? "Prueba enviada" : "Notificación enviada",
      description: isTest 
        ? "Se envió una notificación de prueba a tu dispositivo" 
        : "La notificación fue enviada a todos los pases activos",
    });

    if (!isTest) {
      setPushTitle("");
      setPushMessage("");
    }
  };

  const toggleAutomation = (id: string) => {
    setAutomations(prev => 
      prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a)
    );
  };

  const updateAutomationConfig = (id: string, field: string, value: string | number) => {
    setAutomations(prev =>
      prev.map(a => 
        a.id === id 
          ? { ...a, config: { ...a.config, [field]: value } }
          : a
      )
    );
  };

  const handleRunAllAutomations = () => {
    toast({
      title: "Automatizaciones ejecutadas",
      description: "Se procesaron todas las reglas activas",
    });
  };

  const handleTestAutomation = (id: string) => {
    const automation = automations.find(a => a.id === id);
    toast({
      title: "Prueba enviada",
      description: `Se envió una prueba de "${automation?.title}"`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-white font-playfair flex items-center gap-3">
            <Bell className="text-primary" /> Notificaciones
          </h1>
          <p className="text-white/60 text-sm mt-1">
            Envía notificaciones push a los pases de tus clientes
          </p>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Push Notification Form */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-[#1a1a1a]/80 border-white/10 p-6">
            <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
              <Smartphone size={20} className="text-primary" /> 
              Notificaciones Push
            </h3>

            <div className="space-y-4">
              <div>
                <Label className="text-white/80">Título de la notificación</Label>
                <Input
                  value={pushTitle}
                  onChange={(e) => setPushTitle(e.target.value)}
                  placeholder="Ej. ¡Nueva promoción!"
                  maxLength={50}
                  className="bg-black/30 border-white/10 text-white mt-1"
                />
                <span className="text-white/40 text-xs">Máximo 50 caracteres</span>
              </div>

              <div>
                <Label className="text-white/80">Mensaje</Label>
                <Textarea
                  value={pushMessage}
                  onChange={(e) => setPushMessage(e.target.value)}
                  placeholder="Ej. Hoy tenemos 20% de descuento..."
                  maxLength={200}
                  rows={3}
                  className="bg-black/30 border-white/10 text-white mt-1 resize-none"
                />
                <span className="text-white/40 text-xs">Máximo 200 caracteres</span>
              </div>

              <div>
                <Label className="text-white/80">Tipo</Label>
                <Select value={pushType} onValueChange={setPushType}>
                  <SelectTrigger className="bg-black/30 border-white/10 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10">
                    <SelectItem value="promo">🎁 Promoción</SelectItem>
                    <SelectItem value="reminder">⏰ Recordatorio</SelectItem>
                    <SelectItem value="update">📢 Actualización</SelectItem>
                    <SelectItem value="alert">⚠️ Alerta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Preview */}
              <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/40 text-xs">Vista previa:</span>
                  <span className="text-xs">
                    {typeLabels[pushType]?.emoji} {typeLabels[pushType]?.label}
                  </span>
                </div>
                <div className="bg-white/10 rounded-lg p-3">
                  <div className="text-white font-medium text-sm">
                    {pushTitle || "¡Nueva promoción!"}
                  </div>
                  <div className="text-white/60 text-xs mt-1">
                    {pushMessage || "Tu mensaje aparecerá aquí..."}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => handleSendPush(false)}
                  disabled={isSending}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  <Send size={16} className="mr-2" />
                  {isSending ? "Enviando..." : "Enviar a todos"}
                </Button>
                <Button
                  onClick={() => handleSendPush(true)}
                  disabled={isSending}
                  variant="outline"
                  className="border-white/10 text-white/80 hover:bg-white/5"
                >
                  <FlaskConical size={16} className="mr-2" />
                  Prueba
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Notification History */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-[#1a1a1a]/80 border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                <History size={20} className="text-primary" /> 
                Historial
              </h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="text-white/60 hover:text-white">
                  <RefreshCw size={16} />
                </Button>
                <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300">
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 text-white/60 text-xs font-medium">Fecha</th>
                    <th className="text-left py-2 text-white/60 text-xs font-medium">Título</th>
                    <th className="text-left py-2 text-white/60 text-xs font-medium">Tipo</th>
                    <th className="text-center py-2 text-white/60 text-xs font-medium">Enviadas</th>
                    <th className="text-center py-2 text-white/60 text-xs font-medium">Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 text-white/60 text-sm">{item.date}</td>
                      <td className="py-3 text-white text-sm">{item.title}</td>
                      <td className="py-3">
                        <span className="text-xs px-2 py-1 rounded-full bg-white/10">
                          {typeLabels[item.type]?.emoji} {typeLabels[item.type]?.label}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span className="text-green-400 text-sm flex items-center justify-center gap-1">
                          <CheckCircle size={14} /> {item.sent}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span className={`text-sm flex items-center justify-center gap-1 ${item.errors > 0 ? 'text-red-400' : 'text-white/40'}`}>
                          {item.errors > 0 && <XCircle size={14} />} {item.errors}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Automations Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="bg-[#1a1a1a]/80 border-white/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                <Zap size={20} className="text-primary" /> 
                Automatizaciones
              </h3>
              <p className="text-white/60 text-sm mt-1">
                Configura notificaciones automáticas para diferentes eventos
              </p>
            </div>
            <Button 
              onClick={handleRunAllAutomations}
              className="bg-primary hover:bg-primary/90"
            >
              <Play size={16} className="mr-2" />
              Ejecutar Activas
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {automations.map((automation) => (
              <motion.div
                key={automation.id}
                whileHover={{ scale: 1.01 }}
                className="bg-black/20 rounded-xl p-4 border border-white/5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${automation.iconBg}`}>
                      {automation.icon}
                    </div>
                    <span className="text-white font-medium">{automation.title}</span>
                  </div>
                  <Switch
                    checked={automation.enabled}
                    onCheckedChange={() => toggleAutomation(automation.id)}
                  />
                </div>

                <div className="space-y-3">
                  {automation.config.days !== undefined && (
                    <div>
                      <Label className="text-white/60 text-xs">
                        {automation.id === "birthday" ? "Días de anticipación:" : "Días sin visita:"}
                      </Label>
                      <Input
                        type="number"
                        value={automation.config.days}
                        onChange={(e) => updateAutomationConfig(automation.id, "days", parseInt(e.target.value))}
                        className="bg-black/30 border-white/10 text-white mt-1 h-9"
                        min={automation.id === "birthday" ? 0 : 7}
                        max={automation.id === "birthday" ? 30 : 180}
                      />
                    </div>
                  )}

                  {automation.config.stamps !== undefined && (
                    <div>
                      <Label className="text-white/60 text-xs">Faltan X sellos:</Label>
                      <Input
                        type="number"
                        value={automation.config.stamps}
                        onChange={(e) => updateAutomationConfig(automation.id, "stamps", parseInt(e.target.value))}
                        className="bg-black/30 border-white/10 text-white mt-1 h-9"
                        min={1}
                        max={5}
                      />
                    </div>
                  )}

                  <div>
                    <Label className="text-white/60 text-xs">Mensaje:</Label>
                    <Textarea
                      value={automation.config.message}
                      onChange={(e) => updateAutomationConfig(automation.id, "message", e.target.value)}
                      className="bg-black/30 border-white/10 text-white mt-1 resize-none text-sm"
                      rows={2}
                    />
                  </div>

                  <Button
                    onClick={() => handleTestAutomation(automation.id)}
                    variant="ghost"
                    size="sm"
                    className="text-white/60 hover:text-white"
                  >
                    <FlaskConical size={14} className="mr-1" />
                    Probar
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  );
};

export default NotificationsPanel;
