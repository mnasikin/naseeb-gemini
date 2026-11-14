import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, Download, Share2, X } from 'lucide-react';
import type { CharacterState, CharacterStats, EndingSummary } from '../types/simulation';

interface FateCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  character: CharacterState;
  endingSummary: EndingSummary;
  totalChapters?: number;
}

type CardAspect = 'portrait' | 'landscape';

const STAT_LIST: { key: keyof CharacterStats; label: string; color: string }[] = [
  { key: 'health', label: 'Kesehatan', color: '#059669' },
  { key: 'finance', label: 'Keuangan', color: '#2563EB' },
  { key: 'career', label: 'Karier & Ilmu', color: '#4F46E5' },
  { key: 'relationships', label: 'Relasi', color: '#D97706' },
  { key: 'happiness', label: 'Kebahagiaan', color: '#0EA5E9' },
];

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines?: number,
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (maxLines && lines.length >= maxLines) {
        break;
      }
    }
  }

  if (current && (!maxLines || lines.length < maxLines)) {
    lines.push(current);
  } else if (maxLines && lines.length === maxLines && current) {
    const lastIdx = lines.length - 1;
    let lastLine = lines[lastIdx];
    while (ctx.measureText(`${lastLine}…`).width > maxWidth && lastLine.length > 3) {
      lastLine = lastLine.slice(0, -1).trimEnd();
    }
    lines[lastIdx] = `${lastLine}…`;
  }

  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRadarChart(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  stats: CharacterStats,
) {
  const count = STAT_LIST.length;
  const startAngle = -Math.PI / 2;

  // Concentric pentagon rings
  for (let ring = 1; ring <= 4; ring++) {
    const r = (radius * ring) / 4;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const angle = startAngle + (i * 2 * Math.PI) / count;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = ring === 4 ? '#CBD5E1' : '#E2E8F0';
    ctx.lineWidth = ring === 4 ? 1.5 : 1;
    ctx.stroke();
  }

  // Axis spokes
  for (let i = 0; i < count; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / count;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Value polygon
  ctx.beginPath();
  STAT_LIST.forEach((item, i) => {
    const val = Math.max(8, stats[item.key]) / 100;
    const angle = startAngle + (i * 2 * Math.PI) / count;
    const px = cx + radius * val * Math.cos(angle);
    const py = cy + radius * val * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(37, 99, 235, 0.14)';
  ctx.fill();
  ctx.strokeStyle = '#2563EB';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Dots and labels
  STAT_LIST.forEach((item, i) => {
    const rawVal = stats[item.key];
    const norm = Math.max(8, rawVal) / 100;
    const angle = startAngle + (i * 2 * Math.PI) / count;
    const px = cx + radius * norm * Math.cos(angle);
    const py = cy + radius * norm * Math.sin(angle);

    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#2563EB';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const labelDist = radius + 24;
    const lx = cx + labelDist * Math.cos(angle);
    const ly = cy + labelDist * Math.sin(angle);
    ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#334155';
    ctx.textAlign = Math.cos(angle) > 0.2 ? 'left' : Math.cos(angle) < -0.2 ? 'right' : 'center';
    ctx.textBaseline = Math.sin(angle) > 0.3 ? 'top' : Math.sin(angle) < -0.3 ? 'bottom' : 'middle';
    const shortLabel = item.label.split(' ')[0];
    ctx.fillText(`${shortLabel} ${rawVal}`, lx, ly);
  });
}

export function FateCardModal({
  isOpen,
  onClose,
  character,
  endingSummary,
  totalChapters,
}: FateCardModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [aspect, setAspect] = useState<CardAspect>('portrait');
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const renderCard = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = aspect === 'portrait' ? 1080 : 1200;
    const height = aspect === 'portrait' ? 1350 : 675;
    canvas.width = width;
    canvas.height = height;

    // 1. Archival off-white canvas & subtle atmospheric gradients
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, width, height);

    const gradA = ctx.createRadialGradient(width * 0.12, height * 0.1, 10, width * 0.12, height * 0.1, width * 0.6);
    gradA.addColorStop(0, 'rgba(37, 99, 235, 0.08)');
    gradA.addColorStop(1, 'rgba(37, 99, 235, 0)');
    ctx.fillStyle = gradA;
    ctx.fillRect(0, 0, width, height);

    const gradB = ctx.createRadialGradient(width * 0.88, height * 0.88, 10, width * 0.88, height * 0.88, width * 0.55);
    gradB.addColorStop(0, character.stats.health === 0 ? 'rgba(225, 29, 72, 0.07)' : 'rgba(217, 119, 6, 0.08)');
    gradB.addColorStop(1, 'rgba(217, 119, 6, 0)');
    ctx.fillStyle = gradB;
    ctx.fillRect(0, 0, width, height);

    // Subtle destiny curves
    ctx.save();
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.09)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.moveTo(-40, height * 0.22);
    ctx.bezierCurveTo(width * 0.35, height * 0.08, width * 0.65, height * 0.36, width + 40, height * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-40, height * 0.82);
    ctx.bezierCurveTo(width * 0.3, height * 0.94, width * 0.7, height * 0.7, width + 40, height * 0.85);
    ctx.stroke();
    ctx.restore();

    // Inner card container
    const pad = aspect === 'portrait' ? 56 : 40;
    const cardX = pad;
    const cardY = pad;
    const cardW = width - pad * 2;
    const cardH = height - pad * 2;

    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.stroke();

    const innerPad = aspect === 'portrait' ? 56 : 44;
    const contentX = cardX + innerPad;
    const contentW = cardW - innerPad * 2;

    // Header row
    const headerY = cardY + innerPad;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = '600 28px "Fraunces", Georgia, serif';
    ctx.fillStyle = '#0F172A';
    ctx.fillText('Naseeb', contentX, headerY);

    ctx.textAlign = 'right';
    ctx.font = '500 15px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748B';
    const metaRight = totalChapters
      ? `${totalChapters} Bab · ${character.phase}`
      : character.phase;
    ctx.fillText(metaRight, contentX + contentW, headerY + 8);

    // Hairline under header
    const dividerY = headerY + 48;
    ctx.beginPath();
    ctx.moveTo(contentX, dividerY);
    ctx.lineTo(contentX + contentW, dividerY);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (aspect === 'portrait') {
      // Identity kicker
      let cursorY = dividerY + 34;
      ctx.textAlign = 'left';
      ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#2563EB';
      ctx.fillText(
        `${character.name}  ·  ${character.gender}  ·  Kelas ${character.familyClass || 'Middle'}`,
        contentX,
        cursorY,
      );

      // Archetype Title
      cursorY += 34;
      ctx.font = '600 46px "Fraunces", Georgia, serif';
      ctx.fillStyle = '#0F172A';
      const titleLines = wrapLines(ctx, endingSummary.archetypeTitle, contentW, 2);
      for (const line of titleLines) {
        ctx.fillText(line, contentX, cursorY);
        cursorY += 56;
      }

      // Fate Headline
      cursorY += 8;
      ctx.font = '400 20px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#475569';
      const headlineLines = wrapLines(ctx, endingSummary.fateHeadline, contentW, 3);
      for (const line of headlineLines) {
        ctx.fillText(line, contentX, cursorY);
        cursorY += 30;
      }

      // Middle Section: Left = Stat Bars, Right = Radar Chart
      const statsTop = cursorY + 32;
      ctx.beginPath();
      ctx.moveTo(contentX, statsTop - 14);
      ctx.lineTo(contentX + contentW, statsTop - 14);
      ctx.strokeStyle = '#F1F5F9';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = '600 14px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#64748B';
      ctx.fillText('KONDISI AKHIR HIDUPMU', contentX, statsTop + 4);

      const barAreaW = contentW * 0.52;
      let barY = statsTop + 42;
      for (const item of STAT_LIST) {
        const val = character.stats[item.key];
        ctx.textAlign = 'left';
        ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillStyle = '#1E293B';
        ctx.fillText(item.label, contentX, barY);

        ctx.textAlign = 'right';
        ctx.font = '600 16px "JetBrains Mono", monospace';
        ctx.fillStyle = '#0F172A';
        ctx.fillText(String(val), contentX + barAreaW, barY);

        // Bar track
        const trackY = barY + 26;
        drawRoundedRect(ctx, contentX, trackY, barAreaW, 10, 5);
        ctx.fillStyle = '#E2E8F0';
        ctx.fill();

        if (val > 0) {
          drawRoundedRect(ctx, contentX, trackY, Math.max(10, (barAreaW * val) / 100), 10, 5);
          ctx.fillStyle = item.color;
          ctx.fill();
        }
        barY += 54;
      }

      // Radar chart on the right
      const radarCx = contentX + contentW * 0.78;
      const radarCy = statsTop + 175;
      drawRadarChart(ctx, radarCx, radarCy, 110, character.stats);

      // Traits & Key Turning Points
      let legacyY = statsTop + 332;
      ctx.beginPath();
      ctx.moveTo(contentX, legacyY);
      ctx.lineTo(contentX + contentW, legacyY);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      legacyY += 26;
      if (character.traits.length > 0) {
        ctx.textAlign = 'left';
        ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillStyle = '#64748B';
        ctx.fillText('SIFAT YANG KEBENTUK', contentX, legacyY);
        legacyY += 24;

        ctx.font = '600 17px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillStyle = '#0F172A';
        const traitText = character.traits.join('  ·  ');
        const traitLines = wrapLines(ctx, traitText, contentW, 2);
        for (const line of traitLines) {
          ctx.fillText(line, contentX, legacyY);
          legacyY += 26;
        }
        legacyY += 14;
      }

      // Turning Points
      if (endingSummary.keyTurningPoints?.length > 0) {
        ctx.textAlign = 'left';
        ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillStyle = '#64748B';
        ctx.fillText('MOMEN PALING NENTUIN', contentX, legacyY);
        legacyY += 24;

        endingSummary.keyTurningPoints.slice(0, 3).forEach((pt, idx) => {
          ctx.font = '600 14px "JetBrains Mono", monospace';
          ctx.fillStyle = '#2563EB';
          ctx.fillText(`0${idx + 1}.`, contentX, legacyY + 2);

          ctx.font = '400 16px "Plus Jakarta Sans", system-ui, sans-serif';
          ctx.fillStyle = '#334155';
          const ptLines = wrapLines(ctx, pt, contentW - 38, 2);
          for (const line of ptLines) {
            ctx.fillText(line, contentX + 38, legacyY);
            legacyY += 23;
          }
          legacyY += 8;
        });
      }

      // Quote at bottom above footer
      const quoteBoxY = cardY + cardH - innerPad - 108;
      ctx.beginPath();
      ctx.moveTo(contentX, quoteBoxY);
      ctx.lineTo(contentX + contentW, quoteBoxY);
      ctx.strokeStyle = '#F1F5F9';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.font = 'italic 500 20px "Fraunces", Georgia, serif';
      ctx.fillStyle = '#1E293B';
      const quoteLines = wrapLines(ctx, `“${endingSummary.lifeQuote}”`, contentW, 2);
      quoteLines.forEach((line, i) => {
        ctx.fillText(line, contentX, quoteBoxY + 18 + i * 28);
      });

      // Footer
      const footerY = cardY + cardH - innerPad - 14;
      ctx.font = '500 13px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'left';
      ctx.fillText('Ringkasan Takdir · Simulasi Kehidupan Interaktif', contentX, footerY);
      ctx.textAlign = 'right';
      ctx.font = '600 13px "JetBrains Mono", monospace';
      ctx.fillText('naseeb.app', contentX + contentW, footerY);
    } else {
      // LANDSCAPE 16:9 (1200 x 675)
      const leftW = contentW * 0.56;
      const rightX = contentX + leftW + 44;
      const rightW = contentW - leftW - 44;

      let cursorY = dividerY + 26;
      ctx.textAlign = 'left';
      ctx.font = '600 15px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#2563EB';
      ctx.fillText(
        `${character.name}  ·  ${character.gender}  ·  Kelas ${character.familyClass || 'Middle'}`,
        contentX,
        cursorY,
      );

      cursorY += 28;
      ctx.font = '600 38px "Fraunces", Georgia, serif';
      ctx.fillStyle = '#0F172A';
      const titleLines = wrapLines(ctx, endingSummary.archetypeTitle, leftW, 2);
      for (const line of titleLines) {
        ctx.fillText(line, contentX, cursorY);
        cursorY += 46;
      }

      cursorY += 6;
      ctx.font = '400 17px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#475569';
      const headlineLines = wrapLines(ctx, endingSummary.fateHeadline, leftW, 3);
      for (const line of headlineLines) {
        ctx.fillText(line, contentX, cursorY);
        cursorY += 25;
      }

      if (character.traits.length > 0) {
        cursorY += 16;
        ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillStyle = '#64748B';
        ctx.fillText('SIFAT YANG KEBENTUK', contentX, cursorY);
        cursorY += 20;
        ctx.font = '600 15px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillStyle = '#0F172A';
        const traitLines = wrapLines(ctx, character.traits.join('  ·  '), leftW, 2);
        for (const line of traitLines) {
          ctx.fillText(line, contentX, cursorY);
          cursorY += 22;
        }
      }

      // Quote near bottom-left
      const quoteY = cardY + cardH - innerPad - 82;
      ctx.font = 'italic 500 17px "Fraunces", Georgia, serif';
      ctx.fillStyle = '#1E293B';
      const quoteLines = wrapLines(ctx, `“${endingSummary.lifeQuote}”`, leftW, 2);
      quoteLines.forEach((line, i) => {
        ctx.fillText(line, contentX, quoteY + i * 24);
      });

      // Right column: Radar + compact stats
      drawRadarChart(ctx, rightX + rightW / 2, dividerY + 148, 92, character.stats);

      let statBarY = dividerY + 292;
      const colW = (rightW - 18) / 2;
      STAT_LIST.forEach((item, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const sx = rightX + col * (colW + 18);
        const sy = statBarY + row * 46;
        const val = character.stats[item.key];

        ctx.textAlign = 'left';
        ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
        ctx.fillStyle = '#334155';
        ctx.fillText(item.label.split(' ')[0], sx, sy);

        ctx.textAlign = 'right';
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.fillStyle = '#0F172A';
        ctx.fillText(String(val), sx + colW, sy);

        drawRoundedRect(ctx, sx, sy + 20, colW, 7, 3.5);
        ctx.fillStyle = '#E2E8F0';
        ctx.fill();

        if (val > 0) {
          drawRoundedRect(ctx, sx, sy + 20, Math.max(7, (colW * val) / 100), 7, 3.5);
          ctx.fillStyle = item.color;
          ctx.fill();
        }
      });

      // Footer
      const footerY = cardY + cardH - innerPad - 12;
      ctx.font = '500 12px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'left';
      ctx.fillText('Ringkasan Takdir · Simulasi Kehidupan Interaktif', contentX, footerY);
      ctx.textAlign = 'right';
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillText('naseeb.app', contentX + contentW, footerY);
    }
  }, [aspect, character, endingSummary, totalChapters]);

  useEffect(() => {
    if (isOpen) {
      renderCard();
    }
  }, [isOpen, renderCard]);

  const getSafeFilename = () => {
    const slug = character.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `naseeb-${slug || 'takdir'}-${aspect}.png`;
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = getSafeFilename();
    link.click();
  };

  const getShareCaption = () => {
    const s = character.stats;
    return [
      `Ini hasil hidup ${character.name} di Naseeb: "${endingSummary.archetypeTitle}"`,
      endingSummary.fateHeadline,
      `Fase: ${character.phase} · Sehat ${s.health} · Uang ${s.finance} · Karier ${s.career} · Relasi ${s.relationships} · Bahagia ${s.happiness}`,
      `"${endingSummary.lifeQuote}"`,
    ].join('\n\n');
  };

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(getShareCaption());
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      setShareFeedback('Yah, gagal nyalin teks ke clipboard.');
    }
  };

  const handleCopyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setShareFeedback(null);

    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
      if (!blob || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
        setShareFeedback('Browser ini belum dukung salin gambar langsung. Pakai tombol Unduh PNG aja ya.');
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2000);
    } catch {
      setShareFeedback('Nggak bisa salin gambar di browser ini. Unduh PNG aja ya.');
    }
  };

  const handleNativeShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setShareFeedback(null);

    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
      if (!blob) return;

      const file = new File([blob], getSafeFilename(), { type: 'image/png' });
      const caption = getShareCaption();

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Naseeb: ${endingSummary.archetypeTitle}`,
          text: caption,
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: `Naseeb: ${endingSummary.archetypeTitle}`,
          text: caption,
        });
      } else {
        handleDownload();
        setShareFeedback('Browser nggak support share langsung, jadi kartu PNG udah keunduh ya.');
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setShareFeedback('Share dibatalin atau belum tersedia. Pakai Unduh PNG atau Salin Gambar aja.');
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/55 backdrop-blur-sm p-0 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fate-card-modal-title"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[92vh] sm:max-h-[90vh] bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col my-0 sm:my-auto"
          >
            <div className="px-5 sm:px-6 pt-3 sm:py-4 pb-3.5 border-b border-slate-200 shrink-0">
              <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2
                    id="fate-card-modal-title"
                    className="font-editorial text-lg sm:text-xl font-semibold text-slate-900"
                  >
                    Kartu Ringkasan Nasib
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Dibikin via Canvas · tinggal unduh & share ke medsos
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Tutup kartu ringkasan"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto pb-8 sm:pb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
                  <button
                    type="button"
                    onClick={() => setAspect('portrait')}
                    className={`px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap min-h-[38px] ${
                      aspect === 'portrait'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Potret (4:5)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspect('landscape')}
                    className={`px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap min-h-[38px] ${
                      aspect === 'landscape'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Lanskap (16:9)
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5">
                  <button
                    type="button"
                    onClick={handleCopyCaption}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl sm:rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap min-h-[44px]"
                  >
                    {copiedText ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Teks Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Teks</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyImage}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl sm:rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap min-h-[44px]"
                  >
                    {copiedImage ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Gambar Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Gambar</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl sm:rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap min-h-[44px]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh PNG</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl sm:rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap min-h-[44px]"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Bagikan</span>
                  </button>
                </div>
              </div>

              {shareFeedback && (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2">
                  {shareFeedback}
                </p>
              )}

              <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-3 sm:p-4 flex items-center justify-center overflow-hidden">
                <canvas
                  ref={canvasRef}
                  className={`rounded-lg shadow-md bg-white max-w-full h-auto ${
                    aspect === 'portrait' ? 'max-h-[48vh] sm:max-h-[60vh]' : 'max-h-[44vh] sm:max-h-[54vh]'
                  }`}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
