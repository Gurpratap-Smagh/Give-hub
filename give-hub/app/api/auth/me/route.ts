/**
 * FILE: app/api/auth/me/route.ts
 * PURPOSE: Get current authenticated user information
 * ACCESS: GET /api/auth/me
 * MIGRATION NOTES:
 * - Replace mock user operations with MongoDB User.findById()
 * - Add user profile data aggregation
 * TODO:
 * - Add user statistics and activity data
 * - Implement user profile caching
 */

import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from '@/lib/auth';

async function handler(request: NextRequest) {
  try {
    // User data is already attached by authMiddleware
    const user = (request as NextRequest & { user: { id: string; username: string; email: string; role: string } }).user;
    
    return NextResponse.json(
      {
        success: true,
        user: user
      },
      { status: 200 }
    );
    
  } catch (error) {
    console.error('Get user API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Apply auth middleware to GET request
export const GET = authMiddleware(handler);

// Handle unsupported methods
export async function POST() {
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
