import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, QrCode, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import venusLogo from "@/assets/venus-logo.png";

interface LoyaltyCardProps {
  stamps?: number;
  totalStamps?: number;
  clientName?: string;
}

export const LoyaltyCard = ({
  stamps = 6,
  totalStamps = 8,
  clientName = "María García",
}: LoyaltyCardProps) => {
  const [showQR, setShowQR] = useState(false);

  return (
    <section id="lealtad" className="py-24 hero-gradient">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-venus-cream/20 text-venus-cream text-sm font-medium mb-4">
            <Gift className="w-4 h-4" />
            Programa de Lealtad
          </span>
          <h2 className="font-playfair text-3xl md:text-5xl font-bold text-venus-cream mb-4">
            Tu tarjeta de fidelidad
          </h2>
          <p className="text-venus-cream/70 max-w-xl mx-auto">
            Acumula sellos con cada visita y obtén un servicio gratis al
            completar tu tarjeta.
          </p>
        </motion.div>

        {/* Card Container */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-md mx-auto"
        >
          {/* Loyalty Card */}
          <div className="relative bg-gradient-to-br from-venus-cream to-venus-cream-dark rounded-3xl p-6 shadow-elevated">
            {/* Card Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <img
                  src={venusLogo}
                  alt="Venus"
                  className="w-12 h-12 rounded-xl"
                />
                <div>
                  <h3 className="font-playfair text-lg font-semibold text-venus-forest">
                    Venus Lealtad
                  </h3>
                  <p className="text-sm text-venus-olive-dark">{clientName}</p>
                </div>
              </div>
              <button
                onClick={() => setShowQR(!showQR)}
                className="p-2 rounded-xl bg-venus-forest/10 hover:bg-venus-forest/20 transition-colors"
              >
                {showQR ? (
                  <X className="w-5 h-5 text-venus-forest" />
                ) : (
                  <QrCode className="w-5 h-5 text-venus-forest" />
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
                  {[...Array(totalStamps)].map((_, index) => (
                    <motion.div
                      key={index}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className={`aspect-square rounded-2xl flex items-center justify-center transition-all ${index < stamps
                          ? "bg-venus-olive shadow-md"
                          : "bg-venus-forest/10 border-2 border-dashed border-venus-forest/30"
                        }`}
                    >
                      {index < stamps ? (
                        <Check className="w-6 h-6 text-venus-cream" />
                      ) : (
                        <span className="text-xs text-venus-forest/40 font-semibold">
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
                  className="flex items-center justify-center py-8 mb-6"
                >
                  <div className="w-40 h-40 bg-venus-forest rounded-2xl flex items-center justify-center">
                    <QrCode className="w-24 h-24 text-venus-cream" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-venus-forest/70">Tu progreso</span>
                <span className="font-semibold text-venus-forest">
                  {stamps}/{totalStamps} sellos
                </span>
              </div>
              <div className="h-3 bg-venus-forest/10 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(stamps / totalStamps) * 100}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                  className="h-full bg-gradient-to-r from-venus-olive to-venus-sage rounded-full"
                />
              </div>
            </div>

            {/* Reward Info */}
            <div className="p-4 bg-venus-forest/5 rounded-xl">
              <p className="text-sm text-venus-forest text-center">
                {stamps === totalStamps ? (
                  <span className="font-semibold">
                    🎉 ¡Felicidades! Tu próximo servicio es gratis
                  </span>
                ) : (
                  <>
                    Te faltan{" "}
                    <span className="font-semibold">
                      {totalStamps - stamps} sellos
                    </span>{" "}
                    para tu servicio gratis
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Action Button */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-6 space-y-2"
          >
            <button
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 text-gray-900 rounded-lg font-medium transition-colors border border-gray-300"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>Guardar en Google Wallet</span>
            </button>
            <button
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-black hover:bg-gray-900 text-white rounded-lg font-medium transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <span>Agregar a Apple Wallet</span>
            </button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};
