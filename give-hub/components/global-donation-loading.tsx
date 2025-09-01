'use client'

import React from 'react'
import { useDonationProcessing } from '@/lib/hooks/donationProcessingStore'
import { DonationLoading } from './donation-loading'

export function GlobalDonationLoading() {
  const { isProcessing, message, status } = useDonationProcessing()
  
  return (
    <DonationLoading 
      isVisible={isProcessing} 
      message={message}
      isError={status === 'error'}
      isSuccess={status === 'success'}
    />
  );
}
