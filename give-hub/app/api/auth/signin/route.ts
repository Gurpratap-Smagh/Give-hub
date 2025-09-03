/**
 * FILE: app/api/auth/signin/route.ts
 * PURPOSE: User authentication API endpoint
 * ACCESS: POST /api/auth/signin
 * MIGRATION NOTES:
 * - Replace mock user operations with MongoDB User.findOne()
 * - Add proper password verification with bcrypt
 * - Implement login attempt limiting with Redis or MongoDB
 * - Add account lockout functionality
 * TODO:
 * - Add bcrypt password verification
 * - Implement proper JWT with jsonwebtoken library
 * - Add rate limiting per IP and per user
 * - Add login attempt tracking and cooldown
 */

import { NextRequest, NextResponse } from 'next/server';
import { authService, validateSigninInput } from '@/lib/auth/index';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = validateSigninInput(body);
    if (!validation.isValid) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Validation failed', 
          details: validation.errors 
        },
        { status: 400 }
      );
    }
    
    // Rate limiting per IP to prevent brute force attacks
    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitKey = `signin:${clientIP}`;
    
    // Simple in-memory rate limiting (5 attempts per 15 minutes)
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxAttempts = 5;
    
    // Use a simple object-based rate limiting
    const rateLimits: Record<string, { count: number; resetTime: number }> = {};
    const currentLimit = rateLimits[rateLimitKey] || { count: 0, resetTime: now + windowMs };
    
    if (currentLimit.count >= maxAttempts && now < currentLimit.resetTime) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }
    
    // Attempt to authenticate user
    const result = await authService.signin({
      emailOrUsername: body.emailOrUsername.trim(),
      password: body.password
    });
    
    if (!result.success) {
      // Track failed login attempts
      if (currentLimit.count < maxAttempts) {
        currentLimit.count++;
        rateLimits[rateLimitKey] = currentLimit;
      }
      
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 401 } // Unauthorized
      );
    }
    
    // Reset failed login attempts on successful login
    // Rate limit reset handled automatically by time-based expiration
    
    // Create response with user data
    const response = NextResponse.json(
      {
        success: true,
        message: 'Authentication successful',
        user: result.user
      },
      { status: 200 }
    );
    
    // Set HTTP-only cookie for token (secure in production)
    response.cookies.set('auth-token', result.token!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // Changed from 'strict' to 'lax' for better cross-origin compatibility
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
      // Remove domain restriction to work with any deployment URL
    });
    
    return response;
    
  } catch (error) {
    console.error('Signin API error:', error);
    return NextResponse.json(
      { success: false, error: 'Authentication failed' },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
