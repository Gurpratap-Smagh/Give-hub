// lib/ai/schema.ts
import { z } from "zod";

export const PlanSchema = z.union([
  z.object({
    type: z.literal("search_campaigns"),
    query: z.object({
      q: z.string().optional(),
      title: z.string().optional(),
      category: z.string().optional(),
      creatorId: z.string().optional(),
      goal: z.union([z.number(), z.object({ min: z.number().optional(), max: z.number().optional() })]).optional(),
      raised: z.union([z.number(), z.object({ min: z.number().optional(), max: z.number().optional() })]).optional(),
      limit: z.number().int().min(1).max(25).optional(),
      sortBy: z.enum(["goal", "raised", "deadline", "created"]).optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
      titleOnly: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal("open_payment"),
    campaignId: z.string().optional(),
    amount: z.number().optional(),
    chain: z.string().optional(),
    token: z.string().optional(),
  }),
  z.object({
    type: z.literal("fill_payment"),
    campaignId: z.string().optional(),
    amount: z.number().optional(),
    chain: z.string().optional(),
    token: z.string().optional(),
  }),
  z.object({
    type: z.literal("info"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("chat"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("suggest"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("reject"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("final"),
    text: z.string(),
  }),
]);

export type Plan = z.infer<typeof PlanSchema>;

// The response from the API can include a 'search' type, distinct from the planner's action types
export type ApiResponseType = Plan["type"] | "search";
