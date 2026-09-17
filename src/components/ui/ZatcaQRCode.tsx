import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Check, Copy } from 'lucide-react';

interface ZatcaQRCodeProps {
  value: string;
  size?: number;
  showDetails?: boolean;
}

export const ZatcaQRCode: React.FC<ZatcaQRCodeProps> = ({
  value,
  size = 140,
  showDetails = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    QRCode.toCanvas(
      canvasRef.current,
      value,
      {
        width: size,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'M',
      },
      (err) => {
        if (err) {
          setError('فشل توليد رمز الاستجابة السريعة');
        } else {
          setError(null);
        }
      }
    );
  }, [value, size]);

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!value) {
    return (
      <div
        className="flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-lg p-4 text-slate-400 bg-slate-50"
        style={{ width: size + 20, height: size + 20 }}
      >
        <QrCode className="w-8 h-8 mb-1 opacity-50" />
        <span className="text-[11px] text-center">رمز QR غير متوفر</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-xs flex flex-col items-center">
        <canvas ref={canvasRef} />
        {error && <p className="text-[11px] text-rose-500 mt-1">{error}</p>}
      </div>

      {showDetails && (
        <div className="mt-2 text-center flex flex-col items-center">
          <span className="text-[10px] text-slate-500 font-medium">رمز ZATCA المرحلة 2 المعتمد</span>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 font-medium px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" />
                <span>تم النسخ</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>نسخ كود TLV</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
