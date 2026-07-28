import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import type { PaymentInvoice } from '../../types';

interface PaymentModalProps {
  invoice: PaymentInvoice;
  onPaid: () => void;
  onClose: () => void;
}

export function PaymentModal({ invoice, onPaid, onClose }: PaymentModalProps) {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paymentStatus = useAuthStore((s) => s.paymentStatus);
  const pollPaymentStatus = useAuthStore((s) => s.pollPaymentStatus);

  const startPolling = useCallback(() => {
    // Poll every 3 seconds
    pollRef.current = setInterval(async () => {
      await pollPaymentStatus(invoice.invoice_id);
    }, 3000);
  }, [invoice.invoice_id, pollPaymentStatus]);

  useEffect(() => {
    startPolling();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [startPolling]);

  useEffect(() => {
    if (paymentStatus === 'paid') {
      onPaid();
    }
  }, [paymentStatus, onPaid]);

  const openPayment = () => {
    window.open(invoice.bot_invoice_url, '_blank', 'width=400,height=600');
  };

  const amountDisplay = `${invoice.amount} ${invoice.currency}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative bg-zinc-800 rounded-xl p-6 w-full max-w-sm mx-4 shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(113,113,122,0.5)]">
        <div className="pointer-events-none absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)]" />

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Complete Payment</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-zinc-400 mb-4">
          Pay via Telegram CryptoBot. Click the button below to open Telegram.
        </p>

        {/* Amount */}
        <div className="flex items-center justify-center gap-4 py-6 mb-4 bg-zinc-900/50 rounded-xl border border-zinc-700">
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-400">{amountDisplay}</div>
            <div className="text-xs text-zinc-500 mt-1">CryptoBot</div>
          </div>
        </div>

        {/* Pay button */}
        <button
          onClick={openPayment}
          className="w-full bg-[#2AABEE] hover:bg-[#229ED9] text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-3 shadow-[0_4px_14px_rgba(42,171,238,0.3)] mb-3"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.214-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.054 5.56-5.022c.242-.213-.054-.333-.373-.121l-6.861 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.83.945z"/>
          </svg>
          Pay in Telegram
        </button>

        {/* Status indicator */}
        <div className="text-center">
          {paymentStatus === 'polling' && (
            <div className="flex items-center justify-center gap-2 text-xs text-yellow-400">
              <span className="animate-spin">⟳</span>
              Waiting for payment...
            </div>
          )}
          {paymentStatus === 'paid' && (
            <div className="text-xs text-green-400">
              ✓ Payment received!
            </div>
          )}
          {paymentStatus === 'failed' && (
            <div className="text-xs text-red-400">
              Payment failed. Please try again.
            </div>
          )}
        </div>

        {/* Cancel hint */}
        <p className="text-[10px] text-zinc-600 text-center mt-3">
          After payment, you can close the Telegram window. Your balance will update automatically.
        </p>
      </div>
    </div>
  );
}
