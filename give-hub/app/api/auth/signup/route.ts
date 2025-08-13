/**
 * FILE: app/api/auth/signup/route.ts
 * PURPOSE: User registration API endpoint
 * ACCESS: POST /api/auth/signup
 * MIGRATION NOTES:
 * - Replace mock user operations with MongoDB User.create()
 * - Add proper password hashing with bcrypt
 * - Implement rate limiting with Redis or MongoDB
 * - Add email verification functionality
 * TODO:
 * - Add bcrypt password hashing
 * - Implement proper JWT with jsonwebtoken library
 * - Add input sanitization and validation
 * - Add email verification workflow
 */

import { NextRequest, NextResponse } from 'next/server';
import { authService, validateSignupInput } from '@/lib/auth/index';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = validateSignupInput(body);
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
    
    // Attempt to create user
    const result = await authService.signup({
      username: body.username.trim(),
      email: body.email.trim().toLowerCase(),
      password: body.password,
      role: body.role
    });
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 409 } // Conflict - user already exists
      );
    }
    
    // Create response with token in cookie
    const response = NextResponse.json(
      {
        success: true,
        message: 'User created successfully',
        user: result.user
      },
      { status: 201 }
    );
    
    // Set HTTP-only cookie for token (secure in production)
    response.cookies.set('auth-token', result.token!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      // maxAge is in seconds
      maxAge: 60 * 60 * 24 // 24 hours
    });
    
    return response;
    
  } catch (error) {
    console.error('Signup API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
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
