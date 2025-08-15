import { Schema, model, models } from 'mongoose';

const DonationSchema = new Schema({
  campaignId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  amount: { type: Number, required: true },
  chain: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { collection: 'donations' });

DonationSchema.index({ campaignId: 1, timestamp: -1 });

export const DonationModel = models.Donation || model('Donation', DonationSchema);
