import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { User, Mail, Phone, Calendar, ArrowRight, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import venusLogo from "@/assets/venus-logo.png";
import { toast } from "sonner";

const ClientRegister = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    birthday: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.phone || formData.phone.length < 10) {
      toast.error("Por favor ingresa un número de teléfono válido");
      return;
    }

    setIsLoading(true);

    // Simulate registration
    await new Promise(resolve => setTimeout(resolve, 1500));

    toast.success("¡Solicitud enviada! 🎉", {
      description: "Te notificaremos cuando tu tarjeta esté lista"
    });
    navigate("/");
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen hero-gradient flex items-center justify-center p-4 py-12">
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
              Únete a Venus
            </h1>
            <p className="text-venus-olive-dark text-sm">
              Registra tus datos y empieza a acumular recompensas
            </p>
          </div>

          {/* Benefits */}
          <div className="bg-venus-forest/5 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-venus-olive/20 rounded-lg">
                <Gift className="w-5 h-5 text-venus-olive" />
              </div>
              <div>
                <h3 className="font-semibold text-venus-forest text-sm">
                  Beneficios exclusivos
                </h3>
                <ul className="text-xs text-venus-olive-dark space-y-1 mt-1">
                  <li>• Acumula sellos con cada visita</li>
                  <li>• Servicio gratis al completar 8 sellos</li>
                  <li>• Sorpresa especial en tu cumpleaños</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-venus-forest">
                Nombre completo *
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-venus-olive/50" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Tu nombre"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="pl-10 bg-white border-venus-forest/20 focus:border-venus-olive"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-venus-forest">
                Número de teléfono *
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-venus-olive/50" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="427 123 4567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="pl-10 bg-white border-venus-forest/20 focus:border-venus-olive"
                  required
                />
              </div>
              <p className="text-xs text-venus-olive-dark">
                Usarás este número para acceder a tu tarjeta
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-venus-forest">
                Correo electrónico (opcional)
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-venus-olive/50" />
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="pl-10 bg-white border-venus-forest/20 focus:border-venus-olive"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="birthday" className="text-venus-forest">
                Fecha de cumpleaños *
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-venus-olive/50" />
                <Input
                  id="birthday"
                  type="date"
                  value={formData.birthday}
                  onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                  className="pl-10 bg-white border-venus-forest/20 focus:border-venus-olive"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-venus-olive hover:bg-venus-olive-dark text-venus-cream mt-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-venus-cream/30 border-t-venus-cream rounded-full animate-spin" />
              ) : (
                <>
                  Solicitar mi tarjeta
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          {/* Login Link */}
          <p className="text-center text-sm text-venus-olive-dark mt-6">
            ¿Ya tienes tarjeta?{" "}
            <Link to="/login" className="text-venus-olive font-medium hover:underline">
              Ver mi tarjeta
            </Link>
          </p>
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

export default ClientRegister;
