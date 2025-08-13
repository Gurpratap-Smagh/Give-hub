import { NextRequest, NextResponse } from 'next/server'
import { authService } from '@/lib/auth/index'
import { db } from '@/_dev/mock-db/database'
import type { User, Creator } from '@/_dev/mock-db/database'

// GET /api/profile - Get current user profile
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authResult = await authService.verifyToken(token)
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const user = db.findUserById(authResult.userId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Remove password from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _omit, ...sanitized } = user as User
    return NextResponse.json(sanitized)
    
  } catch (error) {
    console.error('Profile GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/profile - Update user profile
export async function PUT(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authResult = await authService.verifyToken(token)
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const user = db.findUserById(authResult.userId)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { profilePicture, bio, location, website, walletAddresses } = body

    // Validate profile picture if provided
    if (profilePicture && !profilePicture.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid profile picture format' }, { status: 400 })
    }

    // Update user data
    const updateData: Partial<User | Creator> & { updatedAt: string } = {
      updatedAt: new Date().toISOString()
    }

    if (profilePicture !== undefined) updateData.profilePicture = profilePicture
    if (bio !== undefined) updateData.bio = bio
    if (location !== undefined) updateData.location = location
    if (website !== undefined) updateData.website = website
    if (walletAddresses !== undefined) {
      // Accept lowercase keys from client and map to DB schema
      const mapped: { Ethereum?: string; Solana?: string; Bitcoin?: string } = {}
      if (walletAddresses.ethereum) mapped.Ethereum = walletAddresses.ethereum
      if (walletAddresses.solana) mapped.Solana = walletAddresses.solana
      if (walletAddresses.bitcoin) mapped.Bitcoin = walletAddresses.bitcoin
      updateData.walletAddresses = Object.keys(mapped).length ? mapped : undefined
    }

    const updatedUser = db.updateUser(authResult.userId, updateData)
    
    if (!updatedUser) {
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
    }

    // Remove password from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _omit2, ...sanitizedUpdated } = updatedUser as User
    return NextResponse.json(sanitizedUpdated)
    
  } catch (error) {
    console.error('Profile PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
