import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Compass } from 'lucide-react';

interface StageIllustrationProps {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
}

export function StageIllustration({
  src,
  alt,
  caption,
  className = '',
}: StageIllustrationProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 border border-slate-200 text-slate-600 p-6 text-center ${className}`}
      >
        <Compass className="w-8 h-8 text-blue-600 mb-3" strokeWidth={1.5} />
        <p className="font-editorial text-base font-medium text-slate-800">{alt}</p>
        {caption && <p className="text-xs text-slate-500 mt-1">{caption}</p>}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
      <AnimatePresence mode="wait">
        <motion.img
          key={src}
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{
            opacity: 1,
            scale: [1.02, 1.08, 1.02],
            x: [0, -8, 6, 0],
            y: [0, -4, 4, 0],
          }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: 0.45 },
            scale: { duration: 22, repeat: Infinity, ease: 'easeInOut' },
            x: { duration: 26, repeat: Infinity, ease: 'easeInOut' },
            y: { duration: 20, repeat: Infinity, ease: 'easeInOut' },
          }}
          className="w-full h-full object-cover will-change-transform"
        />
      </AnimatePresence>
    </div>
  );
}
