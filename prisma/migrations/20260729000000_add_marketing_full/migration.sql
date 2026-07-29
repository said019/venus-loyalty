-- AddMarketingFull: Rol marketing, comisiones, leads, referidos, retos, promociones, touchpoints, UGC

-- AlterTable: cards (campos de marketing)
ALTER TABLE "cards" ADD COLUMN "referral_code" TEXT;
ALTER TABLE "cards" ADD COLUMN "referred_by_card_id" TEXT;
ALTER TABLE "cards" ADD COLUMN "referral_stamps_this_year" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cards" ADD COLUMN "birthday_sent_year" INTEGER;
ALTER TABLE "cards" ADD COLUMN "is_ambassador" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cards" ADD COLUMN "best_send_hour" INTEGER;
ALTER TABLE "cards" ADD COLUMN "public_display_ok" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: appointments (bookedById)
ALTER TABLE "appointments" ADD COLUMN "booked_by_id" TEXT;

-- CreateTable: leads
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'otro',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'nuevo',
    "score" INTEGER NOT NULL DEFAULT 0,
    "marketer_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "contacted_at" TIMESTAMP(3),
    "converted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable: commissions
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "marketer_id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: referrals
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrer_card_id" TEXT NOT NULL,
    "invitee_card_id" TEXT NOT NULL,
    "invitee_phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "completed_at" TIMESTAMP(3),
    "awarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable: challenges
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'tres_visitas_30',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "target_visits" INTEGER NOT NULL DEFAULT 3,
    "window_days" INTEGER NOT NULL DEFAULT 30,
    "visits_completed" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "bonus_stamps" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable: promotions
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'doble_sello',
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: touchpoints
CREATE TABLE "touchpoints" (
    "id" TEXT NOT NULL,
    "card_id" TEXT,
    "channel" TEXT NOT NULL,
    "campaign" TEXT,
    "utm" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appointment_id" TEXT,

    CONSTRAINT "touchpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_booked_by_id_idx" ON "appointments"("booked_by_id");
CREATE UNIQUE INDEX "cards_referral_code_key" ON "cards"("referral_code");
CREATE INDEX "leads_marketer_id_idx" ON "leads"("marketer_id");
CREATE INDEX "leads_status_idx" ON "leads"("status");
CREATE INDEX "leads_score_idx" ON "leads"("score");
CREATE UNIQUE INDEX "leads_appointment_id_key" ON "leads"("appointment_id");
CREATE UNIQUE INDEX "commissions_appointment_id_key" ON "commissions"("appointment_id");
CREATE INDEX "commissions_marketer_id_idx" ON "commissions"("marketer_id");
CREATE INDEX "commissions_status_idx" ON "commissions"("status");
CREATE UNIQUE INDEX "referrals_invitee_card_id_key" ON "referrals"("invitee_card_id");
CREATE INDEX "referrals_referrer_card_id_idx" ON "referrals"("referrer_card_id");
CREATE INDEX "challenges_card_id_idx" ON "challenges"("card_id");
CREATE INDEX "challenges_kind_idx" ON "challenges"("kind");
CREATE INDEX "promotions_active_idx" ON "promotions"("active");
CREATE INDEX "touchpoints_card_id_idx" ON "touchpoints"("card_id");
CREATE INDEX "touchpoints_channel_idx" ON "touchpoints"("channel");
CREATE UNIQUE INDEX "touchpoints_appointment_id_key" ON "touchpoints"("appointment_id");

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_referred_by_card_id_fkey"
    FOREIGN KEY ("referred_by_card_id") REFERENCES "cards"("id") ON DELETE SET NULL;

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_booked_by_id_fkey"
    FOREIGN KEY ("booked_by_id") REFERENCES "admins"("id") ON DELETE SET NULL;

ALTER TABLE "leads" ADD CONSTRAINT "leads_marketer_id_fkey"
    FOREIGN KEY ("marketer_id") REFERENCES "admins"("id") ON DELETE CASCADE;

ALTER TABLE "leads" ADD CONSTRAINT "leads_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL;

ALTER TABLE "commissions" ADD CONSTRAINT "commissions_marketer_id_fkey"
    FOREIGN KEY ("marketer_id") REFERENCES "admins"("id") ON DELETE CASCADE;

ALTER TABLE "commissions" ADD CONSTRAINT "commissions_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE;

ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_card_id_fkey"
    FOREIGN KEY ("referrer_card_id") REFERENCES "cards"("id") ON DELETE CASCADE;

ALTER TABLE "referrals" ADD CONSTRAINT "referrals_invitee_card_id_fkey"
    FOREIGN KEY ("invitee_card_id") REFERENCES "cards"("id") ON DELETE CASCADE;

ALTER TABLE "challenges" ADD CONSTRAINT "challenges_card_id_fkey"
    FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE;

ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_card_id_fkey"
    FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE SET NULL;

ALTER TABLE "touchpoints" ADD CONSTRAINT "touchpoints_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL;