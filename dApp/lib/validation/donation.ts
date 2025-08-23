import { z } from 'zod';

export const donationCreateSchema = z.object({
  campaignId: z.union([z.string().min(1, 'campaignId required'), z.number()]),
  amount: z.number().positive('amount must be positive').finite('invalid amount'),
  txHash: z.string().trim().min(10, 'txHash invalid'),
  from: z.string().trim().min(1, 'from required').max(200, 'from too long'),
}).strict();

export type DonationCreateInput = z.infer<typeof donationCreateSchema>;
