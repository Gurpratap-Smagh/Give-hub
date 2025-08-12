/**
 * FILE: lib/mock_user.ts
 * PURPOSE: TEMPORARY user operations using JSON mock database - REPLACE WITH MONGODB IN PRODUCTION
 * ACCESS: Import User, Creator types and operations in auth components and API routes
 * MIGRATION NOTES:
 * - Data layer: Swap `lib/mock-db/database.ts` with real MongoDB models. Keep the same
 *   method signatures so callers (auth routes, context) require no changes.
 * - Operations mapping:
 *   - findUserByEmail -> UserModel.findOne({ email })
 *   - findUserByUsername -> UserModel.findOne({ username })
 *   - findUserById -> UserModel.findById(id)
 *   - createUser/createCreator -> new UserModel(data).save()
 *   - updateUser -> UserModel.findByIdAndUpdate(id, update, { new: true })
 *   - deleteUser -> UserModel.findByIdAndDelete(id)
 * - Types: Move shared types to `lib/types.ts` and align with Mongoose schemas.
 * - Security: Ensure unique indexes for email/username, hashed passwords (bcrypt),
 *   and server-side validation. Never expose password hashes.
 * - Cleanup: Delete this file and replace imports with real repository/service layer
 *   after MongoDB integration is complete.
 */

import { db, User, Creator, UserRole } from './mock-db/database';

// Re-export types for backward compatibility
export type { User, Creator, UserRole };

// TEMP: Mock database operations - REPLACE WITH MONGODB OPERATIONS
export const mockUserOperations = {
  // TODO: Replace with MongoDB User.findOne({ email })
  findUserByEmail: (email: string): User | Creator | null => {
    return db.findUserByEmail(email);
  },

  // TODO: Replace with MongoDB User.findOne({ username })
  findUserByUsername: (username: string): User | Creator | null => {
    return db.findUserByUsername(username);
  },

  // TODO: Replace with MongoDB User.findById(id)
  findUserById: (id: string): User | Creator | null => {
    return db.findUserById(id);
  },

  // TODO: Replace with MongoDB new User(userData).save()
  createUser: (userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): User => {
    return db.createUser(userData);
  },

  // TODO: Replace with MongoDB new Creator(creatorData).save()
  createCreator: (creatorData: Omit<Creator, 'id' | 'createdAt' | 'updatedAt'>): Creator => {
    return db.createCreator(creatorData);
  },

  // TODO: Replace with MongoDB User.findByIdAndUpdate(id, updateData)
  updateUser: (id: string, updateData: Partial<User | Creator>): User | Creator | null => {
    return db.updateUser(id, updateData);
  },

  // TODO: Replace with MongoDB User.findByIdAndDelete(id)
  deleteUser: (id: string): boolean => {
    return db.deleteUser(id);
  }
};
// add pfp image upload on db integration
// TEMP: Helper functions - REPLACE WITH MONGODB AGGREGATION QUERIES
export const mockUserHelpers = {
  // TODO: Replace with MongoDB aggregation pipeline
  getUserStats: (userId: string) => {
    return db.getUserStats(userId);
  },

  // TODO: Replace with MongoDB User.find({ role: 'creator', verificationStatus: 'verified' })
  getVerifiedCreators: (): Creator[] => {
    return db.getVerifiedCreators();
  },

  // TODO: Replace with MongoDB aggregation for user activity
  getRecentUsers: (limit: number = 10): (User | Creator)[] => {
    return db.getRecentUsers(limit);
  }
};

// Export for easy replacement during MongoDB migration
const mockUserData = {
  mockUserOperations,
  mockUserHelpers
};

export default mockUserData;
