import { z } from 'zod';

export const campaignCreateSchema = z.object({
  title: z.string().trim().min(3, 'title too short').max(120, 'title too long'),
  description: z.string().trim().min(10, 'description too short').max(5000, 'description too long'),
  owner: z.string().trim().min(3, 'owner too short').max(100, 'owner too long'),
  goal: z.number().positive('goal must be positive').finite('invalid goal').optional(),
}).strict();

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
