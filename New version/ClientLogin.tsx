import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Phone, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import venusLogo from "@/assets/venus-logo.png";
import { toast } from "sonner";

const ClientLogin = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [phone, setPhone] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Limpiar teléfono a solo dígitos
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (!cleanPhone || cleanPhone.length < 10) {
      toast.error("Por favor ingresa un número de teléfono válido (10 dígitos)");
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Buscar tarjeta por teléfono en el backend
      const response = await fetch(`/api/public/card-by-phone?phone=${cleanPhone}`);
      const data = await response.json();
      
      if (!data.success || !data.card) {
        toast.error("No encontramos una tarjeta con ese número de teléfono");
        setIsLoading(false);
        return;
      }
      
      // Guardar datos en localStorage para usar en MyCard.tsx
      localStorage.setItem('venus_card', JSON.stringify(data.card));
      
      toast.success(`¡Bienvenida de vuelta, ${data.card.name.split(' ')[0]}!`);
      navigate("/mi-tarjeta");
    } catch (error) {
      console.error('Error al buscar tarjeta:', error);
      toast.error("Error al verificar. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen hero-gradient flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Card */}
        <div className="bg-venus-cream rounded-3xl p-8 shadow-elevated">
          {/* Header */}
          <div className="text-center mb-8">
            <Link to="/">
              <img
                src={venusLogo}
                alt="Venus"
                className="w-16 h-16 mx-auto mb-4 rounded-xl"
              />
            </Link>
            <h1 className="font-playfair text-2xl font-bold text-venus-forest mb-2">
              Ver mi tarjeta
            </h1>
            <p className="text-venus-olive-dark text-sm">
              Ingresa tu número de teléfono para acceder
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-venus-forest">
                Número de teléfono
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-venus-olive/50" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="427 123 4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-10 bg-white border-venus-forest/20 focus:border-venus-olive text-lg"
                  required
                />
              </div>
              <p className="text-xs text-venus-olive-dark">
                El mismo número que usaste al registrarte
              </p>
            </div>

            <Button
              type="submit"
              className="w-full bg-venus-olive hover:bg-venus-olive-dark text-venus-cream"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-venus-cream/30 border-t-venus-cream rounded-full animate-spin" />
              ) : (
                <>
                  Acceder
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-venus-forest/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-venus-cream text-venus-olive-dark">
                ¿Aún no tienes tarjeta?
              </span>
            </div>
          </div>

          {/* Register Link */}
          <Link to="/registro">
            <Button
              variant="outline"
              className="w-full border-venus-forest/20 text-venus-forest hover:bg-venus-forest/5"
            >
              Registrarme ahora
            </Button>
          </Link>
        </div>

        {/* Back to home */}
        <div className="text-center mt-6">
          <Link 
            to="/"
            className="text-venus-cream/70 hover:text-venus-cream text-sm transition-colors"
          >
            ← Volver al inicio
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default ClientLogin;
