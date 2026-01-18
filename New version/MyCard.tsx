import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  Gift,
  QrCode,
  X,
  Check,
  Calendar,
  Clock,
  User,
  LogOut,
  History,
  Sparkles,
  Phone,
  MapPin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import venusLogo from "@/assets/venus-logo.png";

interface CardData {
  id: string;
  name: string;
  phone: string;
  stamps: number;
  max: number;
  redeems: number;
  lastVisit: string | null;
  createdAt: string;
}

interface EventData {
  id: string;
  type: string;
  createdAt: string;
  serviceName?: string;
}

const MyCard = () => {
  const navigate = useNavigate();
  const [showQR, setShowQR] = useState(false);
  const [cardData, setCardData] = useState<CardData | null>(null);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);

  const handleAddToGoogleWallet = async () => {
    if (!cardData) return;
    
    try {
      const res = await fetch('/api/wallet/google/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: cardData.id })
      });
      
      const data = await res.json();
      if (data.saveUrl) {
        window.location.href = data.saveUrl;
      } else {
        alert('No se pudo generar el enlace de Google Wallet');
      }
    } catch (error) {
      console.error('Error adding to Google Wallet:', error);
      alert('Error al agregar a Google Wallet');
    }
  };

  const handleAddToAppleWallet = async () => {
    if (!cardData) return;
    
    try {
      const passUrl = `/api/wallet/apple/${cardData.id}`;
      const tempLink = document.createElement('a');
      tempLink.href = passUrl;
      tempLink.download = `venus-loyalty-${cardData.id}.pkpass`;
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
    } catch (error) {
      console.error('Error adding to Apple Wallet:', error);
      alert('Error al agregar a Apple Wallet');
    }
  };

  useEffect(() => {
    // Cargar datos del localStorage
    const savedCard = localStorage.getItem('venus_card');
    if (!savedCard) {
      // Si no hay datos, redirigir al login
      navigate('/login');
      return;
    }

    try {
      const parsed = JSON.parse(savedCard);
      setCardData(parsed);

      // También cargar eventos si están disponibles
      const savedEvents = localStorage.getItem('venus_card_events');
      if (savedEvents) {
        setEvents(JSON.parse(savedEvents));
      }
    } catch (error) {
      console.error('Error al cargar datos:', error);
      navigate('/login');
    }

    setLoading(false);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('venus_card');
    localStorage.removeItem('venus_card_events');
    navigate('/');
  };

  // Datos del cliente (usar cardData o valores por defecto)
  const client = {
    name: cardData?.name || "Cliente",
    phone: cardData?.phone || "",
    stamps: cardData?.stamps || 0,
    totalStamps: cardData?.max || 8,
    memberSince: cardData?.createdAt
      ? new Date(cardData.createdAt).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
      : "2024",
    totalVisits: (cardData?.stamps || 0) + (cardData?.redeems || 0) * 8,
  };

  const visitHistory = events
    .filter(e => e.type === 'stamp' || e.type === 'redeem')
    .slice(0, 5)
    .map(e => ({
      date: new Date(e.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }),
      service: e.serviceName || (e.type === 'stamp' ? 'Servicio' : 'Canje de premio'),
      stampsEarned: e.type === 'stamp' ? 1 : 0
    }));

  if (loading) {
    return (
      <div className="min-h-screen bg-venus-forest flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-venus-cream/30 border-t-venus-cream rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-venus-forest">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-venus-forest/95 backdrop-blur-xl border-b border-white/10 px-4 py-4">
        <div className="container mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={venusLogo} alt="Venus" className="w-10 h-10 rounded-xl" />
            <span className="font-playfair text-venus-cream text-lg font-semibold">Venus</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-venus-cream/70 text-sm hidden sm:block">
              Hola, {client.name.split(' ')[0]}
            </span>
            <Link to="/">
              <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                <LogOut size={16} />
                <span className="hidden sm:inline ml-2">Salir</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-playfair text-3xl md:text-4xl font-bold text-venus-cream mb-2">
            Mi Tarjeta de Lealtad
          </h1>
          <p className="text-venus-cream/60">
            Miembro desde {client.memberSince} • {client.totalVisits} visitas
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Loyalty Card */}
          <div className="lg:col-span-2 space-y-6">
            {/* Loyalty Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="bg-gradient-to-br from-venus-cream to-venus-cream-dark rounded-3xl p-6 shadow-elevated">
                {/* Card Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <img
                      src={venusLogo}
                      alt="Venus"
                      className="w-14 h-14 rounded-xl"
                    />
                    <div>
                      <h3 className="font-playfair text-xl font-semibold text-venus-forest">
                        Venus Lealtad
                      </h3>
                      <p className="text-sm text-venus-olive-dark">{client.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowQR(!showQR)}
                    className="p-3 rounded-xl bg-venus-forest/10 hover:bg-venus-forest/20 transition-colors"
                  >
                    {showQR ? (
                      <X className="w-6 h-6 text-venus-forest" />
                    ) : (
                      <QrCode className="w-6 h-6 text-venus-forest" />
                    )}
                  </button>
                </div>

                {/* Stamps Grid or QR */}
                <AnimatePresence mode="wait">
                  {!showQR ? (
                    <motion.div
                      key="stamps"
                      initial={{ opacity: 0, rotateY: 90 }}
                      animate={{ opacity: 1, rotateY: 0 }}
                      exit={{ opacity: 0, rotateY: -90 }}
                      className="grid grid-cols-5 gap-3 mb-6"
                    >
                      {[...Array(client.totalStamps)].map((_, index) => (
                        <motion.div
                          key={index}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: index * 0.05 }}
                          className={`aspect-square rounded-2xl flex items-center justify-center transition-all ${index < client.stamps
                            ? "bg-venus-olive shadow-md"
                            : "bg-venus-forest/10 border-2 border-dashed border-venus-forest/30"
                            }`}
                        >
                          {index < client.stamps ? (
                            <Check className="w-7 h-7 text-venus-cream" />
                          ) : (
                            <span className="text-sm text-venus-forest/40 font-semibold">
                              {index + 1}
                            </span>
                          )}
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="qr"
                      initial={{ opacity: 0, rotateY: -90 }}
                      animate={{ opacity: 1, rotateY: 0 }}
                      exit={{ opacity: 0, rotateY: 90 }}
                      className="flex flex-col items-center justify-center py-8 mb-6"
                    >
                      <div className="w-48 h-48 bg-venus-forest rounded-2xl flex items-center justify-center mb-4">
                        <QrCode className="w-32 h-32 text-venus-cream" />
                      </div>
                      <p className="text-sm text-venus-forest/70 text-center">
                        Muestra este código en tu próxima visita
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-venus-forest/70">Tu progreso</span>
                    <span className="font-semibold text-venus-forest">
                      {client.stamps}/{client.totalStamps} sellos
                    </span>
                  </div>
                  <div className="h-4 bg-venus-forest/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(client.stamps / client.totalStamps) * 100}%` }}
                      transition={{ duration: 1, delay: 0.5 }}
                      className="h-full bg-gradient-to-r from-venus-olive to-venus-sage rounded-full"
                    />
                  </div>
                </div>

                {/* Reward Info */}
                <div className="p-4 bg-venus-forest/5 rounded-xl">
                  <p className="text-sm text-venus-forest text-center">
                    {client.stamps === client.totalStamps ? (
                      <span className="font-semibold">
                        🎉 ¡Felicidades! Tu próximo servicio es gratis
                      </span>
                    ) : (
                      <>
                        Te faltan{" "}
                        <span className="font-semibold">
                          {client.totalStamps - client.stamps} sellos
                        </span>{" "}
                        para tu servicio gratis
                      </>
                    )}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Visit History */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-venus-cream font-playfair flex items-center gap-2">
                    <History className="w-5 h-5 text-primary" />
                    Historial de Visitas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {visitHistory.map((visit, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + index * 0.1 }}
                      className="flex items-center justify-between p-4 bg-white/5 rounded-xl"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-venus-cream font-medium">{visit.service}</p>
                          <p className="text-venus-cream/60 text-sm">{visit.date}</p>
                        </div>
                      </div>
                      <span className="px-3 py-1 bg-primary/20 text-primary rounded-full text-sm font-medium">
                        +{visit.stampsEarned} sello
                      </span>
                    </motion.div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-venus-cream font-playfair">
                    Acciones Rápidas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Link to="/#servicios">
                    <Button variant="outline" className="w-full justify-start border-white/10 text-venus-cream hover:bg-white/5">
                      <Calendar className="w-4 h-4 mr-3" />
                      Agendar Cita
                    </Button>
                  </Link>
                  <button
                    onClick={handleAddToGoogleWallet}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-900 rounded-lg font-medium transition-colors border border-gray-300"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span className="text-sm">Guardar en Google Wallet</span>
                  </button>
                  <button
                    onClick={handleAddToAppleWallet}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-black hover:bg-gray-900 text-white rounded-lg font-medium transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                    <span className="text-sm">Agregar a Apple Wallet</span>
                  </button>
                  <a href="https://wa.me/5214271234567" target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="w-full justify-start border-white/10 text-venus-cream hover:bg-white/5">
                      <Phone className="w-4 h-4 mr-3" />
                      Contactar por WhatsApp
                    </Button>
                  </a>
                </CardContent>
              </Card>
            </motion.div>

            {/* Profile Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-venus-cream font-playfair flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" />
                    Mi Perfil
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-venus-cream/60">Nombre</span>
                    <span className="text-venus-cream">{client.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-venus-cream/60">Teléfono</span>
                    <span className="text-venus-cream">{client.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-venus-cream/60">Miembro desde</span>
                    <span className="text-venus-cream">{client.memberSince}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Location */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <Card className="bg-white/5 border-white/10">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 text-venus-cream mb-3">
                    <MapPin className="w-5 h-5 text-primary" />
                    <span className="font-medium">Venus Spa & Beauty</span>
                  </div>
                  <p className="text-venus-cream/60 text-sm">
                    Blvd. Adolfo López Mateos 123, Centro
                    <br />
                    San Juan del Río, Qro. 76800
                  </p>
                  <a
                    href="https://maps.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 text-primary text-sm hover:underline"
                  >
                    Ver en Google Maps →
                  </a>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default MyCard;
