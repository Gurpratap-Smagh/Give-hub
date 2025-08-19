import { NextResponse } from 'next/server'
import { isAddress } from '@/lib/address'

// Returns a sanitized list of ZRC-20 options derived from env
// Shape: [{ label: string, address: string }]
export async function GET() {
  try {
    const env = process.env as unknown as Record<string, string | undefined>
    const options = Object.entries(env)
      .filter(([k, v]) => k.startsWith('NEXT_PUBLIC_ZRC20_') && typeof v === 'string' && isAddress(v as string))
      .map(([k, v]) => ({ label: k.replace('NEXT_PUBLIC_ZRC20_', ''), address: v as string }))
      
    // Add ZETA as a default option, using the WZETA address from env
    const wzetaAddress = process.env.NEXT_PUBLIC_WZETA_ADDRESS;
    if (wzetaAddress && isAddress(wzetaAddress) && !options.some(opt => opt.address.toLowerCase() === wzetaAddress.toLowerCase())) {
      options.push({ label: 'ZETA (Native)', address: wzetaAddress });
    }

    options.sort((a, b) => a.label.localeCompare(b.label));
    return NextResponse.json(options);
  } catch {
    // Don't leak any error details or env on failures
    return NextResponse.json([])
  }
}
