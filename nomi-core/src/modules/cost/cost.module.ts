import { Module } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { CostTrackerService } from './cost-tracker.service';
import { MODEL_PRICING_TOKEN, ModelPricingMap } from './types/pricing.types';

@Module({
  providers: [
    CostTrackerService,
    {
      provide: MODEL_PRICING_TOKEN,
      useFactory: async (prisma: PrismaService): Promise<ModelPricingMap> => {
        const rows = await prisma.modelPricing.findMany();

        if (rows.length === 0) {
          throw new Error(
            'No rows in model_pricing table — seed the database before starting',
          );
        }

        return Object.fromEntries(
          rows.map((r) => [r.model, { input: r.input, output: r.output }]),
        );
      },
      inject: [PrismaService],
    },
  ],
  exports: [CostTrackerService],
})
export class CostModule {}
