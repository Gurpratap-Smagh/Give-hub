import { Schema, model, models } from 'mongoose';

const SyncStateSchema = new Schema({
  key: { type: String, unique: true, index: true }, // e.g., 'givehub:crowdfund'
  contract: { type: String, index: true },
  lastBlock: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'sync_state' });

export const SyncStateModel = models.SyncState || model('SyncState', SyncStateSchema);
