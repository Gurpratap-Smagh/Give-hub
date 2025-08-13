import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/_dev/mock-db/database';
import { authService, validateSigninInput, validateSignupInput, type SigninData, type SignupData } from './auth';

export { authService, validateSigninInput, validateSignupInput };
export type { SigninData, SignupData };
export { AuthProvider, useAuth } from './auth-context';

// Augmented request type for handlers that need user info
export type AuthedRequest = NextRequest & {
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
};

// Simple auth middleware for route handlers (GET/POST etc.)
export function authMiddleware(
  handler: (request: AuthedRequest) => Promise<NextResponse> | NextResponse
) {
  return async (request: NextRequest) => {
    try {
      const token = request.cookies.get('auth-token')?.value;
      if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const verify = await authService.verifyToken(token);
      if (!verify.success || !verify.userId) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }

      const user = db.findUserById(verify.userId);
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 401 });
      }

      const minimalUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      };

      // Create a shallow clone of request with user attached
      const reqWithUser = Object.assign(
        Object.create(Object.getPrototypeOf(request)),
        request,
        { user: minimalUser }
      ) as AuthedRequest;

      return handler(reqWithUser);
    } catch (error) {
      console.error('authMiddleware error:', error);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  };
}
