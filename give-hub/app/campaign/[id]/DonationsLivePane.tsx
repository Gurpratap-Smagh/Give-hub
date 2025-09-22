'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDonationEvents } from '@/lib/hooks/useDonationEvents';
import { formatDonationEvents } from '@/lib/donations/formatter';
import Spinner from '@/components/spinner';

interface DonationsLivePaneProps {
  campaignId: string | number;
  isActive?: boolean;
  isSynced?: boolean;
}

export default function DonationsLivePane({ campaignId }: DonationsLivePaneProps) {
  // Only subscribe when campaignId is numeric to avoid aggregating all campaigns
  const numericCampaignId = useMemo(() => {
    if (campaignId == null) return undefined;
    const s = String(campaignId).trim();
    return /^\d+$/.test(s) ? s : undefined;
  }, [campaignId]);
  const { events, isLoading, connectionStatus } = useDonationEvents(numericCampaignId);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [fullyExpanded, setFullyExpanded] = useState<Record<string, boolean>>({});
  const noteRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const triggerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Debug logging removed to avoid console output in production
  useEffect(() => {
    // Intentionally left blank; previously logged raw events
  }, [events]);

  // Removed callback ref that updated state during render to avoid update-depth loops.
  // We'll approximate overflow via content length and only show a Read more button for long notes.

  const donations = useMemo(() => {
    // Centralized mapping using formatter (includes symbol, icon, and USD estimate)
    return formatDonationEvents(events).map((d) => ({
      id: d.id,
      icon: d.icon || '💰',
      name: d.name,
      symbol: d.symbol,
      amount: d.amount,
      convertedAmount: d.convertedAmount,
      amountFormatted: d.amountFormatted,
      usdFormatted: d.usdFormatted,
      note: d.note,
      blockNumber: d.blockNumber,
      transactionHash: d.txHash,
    }));
  }, [events]);

  const toggleNote = (id: string) => {
    setExpandedNote((prev) => (prev === id ? null : id));
  };

  // Close expanded note when clicking outside the note box or pressing Escape
  useEffect(() => {
    if (!expandedNote) return;
    const handleDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const noteEl = noteRefs.current[expandedNote!];
      const triggerEl = triggerRefs.current[expandedNote!];
      if (noteEl && noteEl.contains(target)) return; // inside the note
      if (triggerEl && triggerEl.contains(target)) return; // on the trigger pill/button
      setExpandedNote(null);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedNote(null);
    };
    document.addEventListener('mousedown', handleDown, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [expandedNote]);

  return (
    <div className="relative rounded-2xl gradient-border-only">
      <div className="rounded-2xl bg-transparent">
        {/* Header with status dot */}
        <div className="px-5 pt-3 pb-2 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold force-header">
              Live Donations
            </h2>
            <div
              className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-400 animate-pulse' : connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}
              title={connectionStatus === 'connected' ? 'Live connection active' : connectionStatus === 'connecting' ? 'Connecting…' : 'Disconnected'}
            >
            </div>
          </div>
        </div>
      </div>
      {/* Gradient divider under title */}
      <div className="mx-5 h-[2px] rounded-full gradient-border opacity-70" />

      {/* Donation List - allow growth up to a max then scroll */}
      <div className="p-3 min-h-[280px] max-h-[420px] overflow-y-auto space-y-2 custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-8">
            <Spinner />
            <p className="text-sm text-gray-500 mt-2">Loading donations...</p>
          </div>
        ) : donations.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center p-4">
            No donations yet. Be the first to contribute!
          </p>
        ) : (
          donations.map((donation) => (
            <div key={donation.id} className="relative overflow-hidden rounded-lg gradient-border-soft-only animate-in slide-in-from-top-2 duration-300">
              {/* Corner fill patch to remove gap and keep corner curved */}
              <div
                className="absolute -top-[1px] -left-[1px] w-8 h-8 rounded-tr-full rounded-bl-full bg-[var(--surface)] z-0 pointer-events-none"
                aria-hidden="true"
              />
              {/* Corner PFP overlay: integrated name that expands on hover */}
              <div className="group/av absolute -top-[1px] -left-[1px] z-10 flex items-center">
                {/* Integrated Avatar + Name */}
                <div className="inline-flex items-center h-8 rounded-tr-full rounded-bl-full pt-[1px] pr-[1px] pb-0 pl-0 overflow-hidden gradient-border transition-all duration-300 group-hover/av:rounded-full">
                  <div className="flex items-center h-full rounded-tr-full rounded-bl-full bg-blue-600 ml-[1px] mt-[1px] transition-all duration-300 group-hover/av:rounded-full group-hover/av:pr-2">
                    {/* Avatar circle */}
                    <span className="w-8 h-full flex items-center justify-center text-[11px] font-bold text-white select-none shrink-0">
                      {(donation.name || 'A').charAt(0).toUpperCase()}
                    </span>
                    {/* Name text that appears on hover */}
                    <span className="max-w-0 opacity-0 overflow-hidden whitespace-nowrap text-[11px] font-semibold text-white transition-all duration-300 group-hover/av:max-w-[150px] group-hover/av:opacity-100 group-hover/av:ml-1">
                      {donation.name}
                    </span>
                  </div>
                </div>
              </div>
              
              <div
                className="group bg-transparent rounded-lg p-3 relative transition-all"
                tabIndex={0}
              >
              {/* Donor name and amount (top row) */}
              <div className="flex items-center justify-between">
                <div className="h-6 flex items-center">
                  <span className="sr-only">{donation.name}</span>
                </div>
                {/* Amount aligned to center vertically with avatar/name */}
                <div className="h-6 flex items-center justify-end">
                  <div className="text-xl font-extrabold leading-none text-gradient">
                    {donation.usdFormatted}
                  </div>
                </div>
              </div>

              {/* Expanded note appears centered between rows when long and expanded */}
              {donation.note && expandedNote === donation.id && ((donation.note || '').trim().split(/\s+/).length >= 5) && (
                <div className="my-2 flex justify-center">
                  <div
                    className="rounded-md gradient-border-only max-w-[90%] md:max-w-[75%] w-full"
                    ref={(el) => { noteRefs.current[donation.id] = el; }}
                  >
                    <div className={`rounded-md p-3 bg-transparent ${fullyExpanded[donation.id] ? '' : 'max-h-24 overflow-hidden'}`}>
                      <p className="text-xs leading-relaxed text-gradient text-glow text-center">
                        {donation.note}
                      </p>
                      {((donation.note || '').length > 140) && !fullyExpanded[donation.id] && (
                        <button
                          onClick={() => setFullyExpanded((prev) => ({ ...prev, [donation.id]: true }))}
                          className="mt-2 text-[11px] underline block mx-auto text-gradient text-glow"
                          aria-label="Expand full note"
                        >
                          Read more
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {/* Sub row: spacer (left) + token amount & symbol (right) */}
              <div className="mt-1 flex items-center justify-between">
                <div className="h-6" />
                <div className="flex h-6 items-center justify-end gap-2">
                  {donation.symbol && donation.transactionHash && (
                    <a
                      href={`https://athens.explorer.zetachain.com/evm/tx/${donation.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center h-6 rounded-full p-[1px] gradient-border"
                      aria-label="View transaction on ZetaScan (opens in a new tab)"
                      title="View on ZetaScan"
                    >
                      <span className="inline-flex items-center h-full rounded-full px-2 bg-blue-600 text-[11px] font-semibold text-white">
                      {donation.amount} {donation.symbol}
                      </span>
                    </a>
                  )}
                </div>
              </div>

              {/* Expanded note block is now rendered between rows. */}
              {/* Bottom-left message preview pill (blends into border). Always visible; toggles popout. */}
              {donation.note && (
                <div
                  className="absolute -bottom-[1px] -left-[1px] z-10"
                  ref={(el) => { triggerRefs.current[donation.id] = el; }}
                >
                  {((donation.note || '').trim().length > 20) ? (
                    <button
                      onClick={() => toggleNote(donation.id)}
                      className="group inline-flex items-center h-6"
                      aria-label={expandedNote === donation.id ? 'Hide message' : 'Show full message'}
                    >
                      <span className="inline-flex items-center h-6 rounded-tr-full rounded-br-full rounded-tl-none rounded-bl-none pt-[1px] pr-[1px] pb-0 pl-0 overflow-hidden gradient-border">
                        <span className="inline-flex items-center h-full rounded-tr-full rounded-br-full rounded-tl-none rounded-bl-none px-2 bg-blue-600 ml-[1px] mb-[1px]">
                          <span className="truncate max-w-[220px] text-[11px] leading-none text-white">
                            {`${(donation.note || '').slice(0, 20)}...click to read`}
                          </span>
                        </span>
                      </span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center h-6 rounded-tr-full rounded-br-full rounded-tl-none rounded-bl-none pt-[1px] pr-[1px] pb-0 pl-0 overflow-hidden gradient-border">
                      <span className="inline-flex items-center h-full rounded-tr-full rounded-br-full rounded-tl-none rounded-bl-none px-2 bg-blue-600 ml-[1px] mb-[1px]">
                        <span className="truncate max-w-[220px] text-[11px] leading-none text-white">
                          {donation.note}
                        </span>
                      </span>
                    </span>
                  )}
                </div>
              )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
