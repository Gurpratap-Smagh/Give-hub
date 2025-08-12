/**
 * FILE: lib/auth.ts
 * PURPOSE: JWT authentication utilities and middleware for GiveHub
 * ACCESS: Import in API routes and middleware for authentication
 * MIGRATION NOTES:
 * - JWT_SECRET should be stored in environment variables
 * - Password hashing will use bcrypt in production
 * - Rate limiting and login attempts should be implemented with Redis/MongoDB
 * TODO:
 * - Add bcrypt for password hashing (currently using plain text for development)
 * - Implement proper rate limiting with persistent storage
 * - Add refresh token functionality
 * - Add password reset functionality
 */

import { NextRequest, NextResponse } from 'next/server';
import { mockUserOperations, User, Creator } from './mock_user';
import jwt, { type Secret, type SignOptions, type JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_SECRET_TYPED: Secret = JWT_SECRET as unknown as Secret;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'; // Token expiration time

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('Missing or weak JWT_SECRET. Please set a strong JWT_SECRET (>=32 chars) in your environment.');
}

// TODO: Remove these constants when implementing real JWT library
// Currently used in mock implementation comments

// Password hashing using bcrypt
const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, 10);
};

const comparePassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return await bcrypt.compare(password, hashedPassword);
};

// JWT Token utilities using jsonwebtoken
const createJWTToken = (payload: { id: string; username: string; role: string }): string => {
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN as unknown as number } as SignOptions;
  return jwt.sign(payload, JWT_SECRET_TYPED, options);
};

const verifyJWTToken = (token: string): { id: string; username: string; role: string } | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET_TYPED) as JwtPayload & { id: string; username: string; role: string };
    return { id: decoded.id, username: decoded.username, role: decoded.role };
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
};

// Authentication functions
export const authService = {
  // Sign up new user
  signup: async (userData: {
    username: string;
    email: string;
    password: string;
    role: 'user' | 'creator';
  }) => {
    try {
      // Check if user already exists
      const existingUserByEmail = mockUserOperations.findUserByEmail(userData.email);
      const existingUserByUsername = mockUserOperations.findUserByUsername(userData.username);
      
      if (existingUserByEmail) {
        return { success: false, error: 'Email already registered' };
      }
      
      if (existingUserByUsername) {
        return { success: false, error: 'Username already taken' };
      }
      
      // Hash password
      const hashedPassword = await hashPassword(userData.password);
      
      // Create user based on role
      let newUser: User | Creator;
      
      if (userData.role === 'creator') {
        newUser = mockUserOperations.createCreator({
          username: userData.username,
          email: userData.email,
          password: hashedPassword,
          role: 'creator',
          createdCampaigns: [],
          totalRaised: 0,
          verificationStatus: 'pending'
        });
      } else {
        newUser = mockUserOperations.createUser({
          username: userData.username,
          email: userData.email,
          password: hashedPassword,
          role: 'user'
        });
      }
      
      // Create JWT token
      const token = createJWTToken({
        id: newUser.id,
        username: newUser.username,
        role: newUser.role
      });
      
      return {
        success: true,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role
        },
        token
      };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: 'Internal server error' };
    }
  },

  // Sign in existing user
  signin: async (credentials: {
    emailOrUsername: string;
    password: string;
  }) => {
    try {
      // Find user by email or username
      let user = mockUserOperations.findUserByEmail(credentials.emailOrUsername);
      if (!user) {
        user = mockUserOperations.findUserByUsername(credentials.emailOrUsername);
      }
      
      if (!user) {
        return { success: false, error: 'User not found' };
      }
      
      // Verify password
      const isPasswordValid = await comparePassword(credentials.password, user.password);
      if (!isPasswordValid) {
        return { success: false, error: 'Invalid password' };
      }
      
      // Create JWT token
      const token = createJWTToken({
        id: user.id,
        username: user.username,
        role: user.role
      });
      
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        token
      };
    } catch (error) {
      console.error('Signin error:', error);
      return { success: false, error: 'Internal server error' };
    }
  },

  // Verify user token
  verifyToken: (token: string) => {
    const decoded = verifyJWTToken(token);
    if (!decoded) {
      return { success: false, error: 'Invalid or expired token' };
    }
    
    // Get current user data
    const user = mockUserOperations.findUserById(decoded.id);
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    
    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    };
  }
};

// Authentication middleware for API routes
export const authMiddleware = (handler: (req: NextRequest) => Promise<NextResponse>) => {
  return async (req: NextRequest) => {
    try {
      // Get token from cookies or Authorization header
      let token = req.cookies.get('auth-token')?.value;
      
      if (!token) {
        const authHeader = req.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        }
      }
      
      if (!token) {
        return NextResponse.json(
          { error: 'No authentication token provided' },
          { status: 401 }
        );
      }
      
      // Verify token
      const decoded = verifyJWTToken(token);
      if (!decoded) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }
      
      // Get user data
      const user = mockUserOperations.findUserById(decoded.id);
      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 401 }
        );
      }
      
      // Add user data to request
      (req as NextRequest & { user: { id: string; username: string; email: string; role: string } }).user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      };
      
      // Call the original handler
      return await handler(req);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }
  };
};

// Role-based access control
export const requireRole = (allowedRoles: string[]) => {
  return (handler: (req: NextRequest) => Promise<NextResponse>) => {
    return authMiddleware(async (req: NextRequest) => {
      const user = (req as NextRequest & { user: { id: string; username: string; email: string; role: string } }).user;
      
      if (!allowedRoles.includes(user.role)) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }
      
      return await handler(req);
    });
  };
};

// Input validation schemas (similar to zod in test repo)
export const validateSignupInput = (data: { username?: string; email?: string; password?: string; role?: string }) => {
  const errors: string[] = [];
  
  if (!data.username || typeof data.username !== 'string' || data.username.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }
  
  if (!data.email || typeof data.email !== 'string' || !data.email.includes('@')) {
    errors.push('Valid email is required');
  }
  
  if (!data.password || typeof data.password !== 'string' || data.password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!data.role || !['user', 'creator'].includes(data.role)) {
    errors.push('Role must be either "user" or "creator"');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateSigninInput = (data: { emailOrUsername?: string; password?: string }) => {
  const errors: string[] = [];
  
  if (!data.emailOrUsername || typeof data.emailOrUsername !== 'string') {
    errors.push('Email or username is required');
  }
  
  if (!data.password || typeof data.password !== 'string') {
    errors.push('Password is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export default authService;
