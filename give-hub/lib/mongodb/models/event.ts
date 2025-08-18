import { Schema, model, models } from 'mongoose';

const EventSchema = new Schema({
  contract: { type: String, index: true },
  event: { type: String, index: true },
  blockNumber: { type: Number, index: true },
  txHash: { type: String, index: true },
  logIndex: { type: Number, index: true },
  args: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'events' });

EventSchema.index({ contract: 1, txHash: 1, logIndex: 1 }, { unique: true, sparse: true });

export const EventModel = models.Event || model('Event', EventSchema);
