/**
 * FILE: app/api/auth/signout/route.ts
 * PURPOSE: User logout API endpoint
 * ACCESS: POST /api/auth/signout
 * MIGRATION NOTES:
 * - In production, consider implementing token blacklisting with Redis
 * - Add proper session management for enhanced security
 * TODO:
 * - Implement token blacklisting for enhanced security
 * - Add session cleanup for database-stored sessions
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(_request: NextRequest) {
  try {
    // Create response
    const response = NextResponse.json(
      {
        success: true,
        message: 'Signed out successfully'
      },
      { status: 200 }
    );
    
    // Clear the auth token cookie
    response.cookies.set('auth-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0 // Expire immediately
    });
    
    return response;
    
  } catch (error) {
    console.error('Signout API error:', error);
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
