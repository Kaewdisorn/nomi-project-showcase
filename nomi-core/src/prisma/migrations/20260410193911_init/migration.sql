-- CreateTable
CREATE TABLE "model_pricing" (
    "id" SERIAL NOT NULL,
    "model" TEXT NOT NULL,
    "input" DOUBLE PRECISION NOT NULL,
    "output" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "model_pricing_model_key" ON "model_pricing"("model");
