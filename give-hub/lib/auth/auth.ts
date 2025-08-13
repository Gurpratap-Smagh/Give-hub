import { db } from '@/_dev/mock-db/database';
import type { UserRole, User, Creator } from '@/_dev/mock-db/database';
import { JWTPayload } from 'jose';
import { SignJWT, jwtVerify } from 'jose';

const secretKey = process.env.JWT_SECRET || 'fallback-secret-key-for-development';
const key = new TextEncoder().encode(secretKey);

const mockHash = async (password: string) => `hashed_${password}`;
const mockCompare = async (password: string, hash: string) => `hashed_${password}` === hash;

interface AuthPayload extends JWTPayload {
  userId: string;
  role: UserRole;
}

async function encrypt(payload: AuthPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1d')
    .sign(key);
}

export interface SignupData {
  username: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface SigninData {
  emailOrUsername: string;
  password: string;
}

export const authService = {
  async signup(data: SignupData) {
    // Uniqueness checks
    const byEmail = await db.findUserByEmail(data.email);
    if (byEmail) {
      return { success: false, error: 'Email already in use' };
    }
    const byUsername = await db.findUserByUsername(data.username);
    if (byUsername) {
      return { success: false, error: 'Username already in use' };
    }

    const hashedPassword = await mockHash(data.password);
    // Route creator signups to proper creator creation to ensure required fields
    const created: User | Creator = data.role === 'creator'
      ? db.createCreator({ ...(data as Omit<Creator, 'id' | 'createdAt' | 'updatedAt'>), password: hashedPassword })
      : db.createUser({ ...(data as Omit<User, 'id' | 'createdAt' | 'updatedAt'>), password: hashedPassword });

    const token = await encrypt({ userId: created.id, role: created.role });

    // Sanitize user object (do not expose password)
    const safeUser = sanitizeUser(created);
    return { success: true, user: safeUser, token };
  },

  async signin(data: SigninData) {
    // Support both emailOrUsername and legacy email field (during migration)
    const idObj = data as unknown as { emailOrUsername?: string; email?: string };
    const identifier = (idObj.emailOrUsername ?? idObj.email ?? '').trim();
    if (!identifier) {
      return { success: false, error: 'Email or username is required' };
    }
    // Try email first, then username
    let user = await db.findUserByEmail(identifier);
    if (!user) {
      user = await db.findUserByUsername(identifier);
    }
    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    const isPasswordValid = await mockCompare(data.password, user.password);
    if (!isPasswordValid) {
      return { success: false, error: 'Invalid credentials' };
    }

    const token = await encrypt({ userId: user.id, role: user.role });
    const safeUser = sanitizeUser(user);
    return { success: true, user: safeUser, token };
  },

  async verifyToken(token: string) {
    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['HS256'],
      });
      return { success: true, userId: payload.userId as string, role: payload.role as UserRole };
    } catch (error) {
      console.error('JWT verification failed:', error);
      return { success: false, error: 'Invalid token' };
    }
  },
};

function sanitizeUser(u: User | Creator): Omit<User | Creator, 'password'> {
  const { password: _removed, ...rest } = u as any;
  return rest;
}

export function validateSignupInput(data: Partial<SignupData & { confirmPassword?: string }>) {
  const errors: Record<string, string> = {};
  if (!data.username || data.username.length < 3) {
    errors.username = 'Username must be at least 3 characters long';
  }
  if (!data.email || !/\S+@\S+\.\S+/.test(data.email)) {
    errors.email = 'Invalid email address';
  }
  if (!data.password || data.password.length < 6) {
    errors.password = 'Password must be at least 6 characters long';
  }
  if (!data.role || !['user', 'creator'].includes(data.role)) {
    errors.role = 'Role must be either user or creator';
  }
  // Only check confirmPassword if it is explicitly provided by the client
  if (typeof data.confirmPassword !== 'undefined') {
    if (data.password !== data.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
  }
  return { isValid: Object.keys(errors).length === 0, errors };
}

export function validateSigninInput(data: Partial<SigninData>) {
  const errors: Record<string, string> = {};
  // Support both emailOrUsername and legacy email field
  const idObj = data as unknown as { emailOrUsername?: string; email?: string };
  const identifier = (idObj.emailOrUsername ?? idObj.email ?? '').trim();
  
  if (!identifier) {
    errors.emailOrUsername = 'Email or username is required';
  } else {
    const looksLikeEmail = /\S+@\S+\.\S+/.test(identifier);
    if (!looksLikeEmail && identifier.length < 3) {
      errors.emailOrUsername = 'Username must be at least 3 characters';
    }
  }
  if (!data.password) {
    errors.password = 'Password is required';
  }
  return { isValid: Object.keys(errors).length === 0, errors };
}
