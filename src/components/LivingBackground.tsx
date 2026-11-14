import { motion } from 'motion/react';
import type { CharacterState } from '../types/simulation';

interface LivingBackgroundProps {
  character: CharacterState | null;
  turn: number;
  isEnding: boolean;
}

interface PaletteMood {
  orbA: string;
  orbB: string;
  orbC: string;
  stroke: string;
}

function getMoodPalette(
  character: CharacterState | null,
  turn: number,
  isEnding: boolean,
): PaletteMood {
  if (!character) {
    return {
      orbA: 'bg-blue-200/45',
      orbB: 'bg-sky-200/40',
      orbC: 'bg-indigo-200/35',
      stroke: 'rgba(37, 99, 235, 0.14)',
    };
  }

  if (character.stats.health <= 25) {
    return {
      orbA: 'bg-rose-200/45',
      orbB: 'bg-amber-200/40',
      orbC: 'bg-slate-300/40',
      stroke: 'rgba(220, 38, 38, 0.14)',
    };
  }

  if (isEnding || turn >= 10) {
    return {
      orbA: 'bg-amber-200/45',
      orbB: 'bg-emerald-200/35',
      orbC: 'bg-orange-100/45',
      stroke: 'rgba(217, 119, 6, 0.14)',
    };
  }

  if (turn >= 4) {
    return {
      orbA: 'bg-indigo-200/45',
      orbB: 'bg-blue-200/40',
      orbC: 'bg-cyan-200/35',
      stroke: 'rgba(79, 70, 229, 0.14)',
    };
  }

  return {
    orbA: 'bg-sky-200/45',
    orbB: 'bg-emerald-200/35',
    orbC: 'bg-blue-200/40',
    stroke: 'rgba(14, 165, 233, 0.15)',
  };
}

const MOTES = [
  { id: 1, left: '8%', top: '18%', size: 6, duration: 9, delay: 0 },
  { id: 2, left: '22%', top: '72%', size: 8, duration: 12, delay: 1.2 },
  { id: 3, left: '38%', top: '30%', size: 5, duration: 10, delay: 2.1 },
  { id: 4, left: '54%', top: '80%', size: 7, duration: 11, delay: 0.7 },
  { id: 5, left: '68%', top: '24%', size: 9, duration: 13, delay: 1.8 },
  { id: 6, left: '84%', top: '62%', size: 6, duration: 9.5, delay: 0.4 },
  { id: 7, left: '91%', top: '38%', size: 5, duration: 11.5, delay: 2.6 },
  { id: 8, left: '14%', top: '46%', size: 4, duration: 10.5, delay: 1.5 },
];

export function LivingBackground({ character, turn, isEnding }: LivingBackgroundProps) {
  const mood = getMoodPalette(character, turn, isEnding);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-[#F6F8FB]"
    >
      {/* Subtle architectural dot grid */}
      <div
        className="absolute inset-0 opacity-45"
        style={{
          backgroundImage: 'radial-gradient(rgba(15, 23, 42, 0.08) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Drifting atmospheric color fields */}
      <motion.div
        className={`absolute -top-32 -left-28 w-[34rem] h-[34rem] rounded-full blur-3xl transition-colors duration-1000 ${mood.orbA}`}
        animate={{
          x: [0, 70, -30, 0],
          y: [0, 45, 90, 0],
          scale: [1, 1.12, 0.96, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className={`absolute top-1/4 -right-32 w-[38rem] h-[38rem] rounded-full blur-3xl transition-colors duration-1000 ${mood.orbB}`}
        animate={{
          x: [0, -80, 25, 0],
          y: [0, -55, 60, 0],
          scale: [1, 0.94, 1.1, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <motion.div
        className={`absolute -bottom-40 left-1/3 w-[32rem] h-[32rem] rounded-full blur-3xl transition-colors duration-1000 ${mood.orbC}`}
        animate={{
          x: [0, 60, -60, 0],
          y: [0, -50, 20, 0],
          scale: [1, 1.08, 0.95, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Flowing destiny threads SVG */}
      <svg
        className="absolute inset-0 w-full h-full opacity-80"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        fill="none"
      >
        <motion.path
          d="M-80 240 C 260 120, 520 420, 880 260 C 1140 140, 1320 260, 1540 180"
          stroke={mood.stroke}
          strokeWidth="1.5"
          strokeDasharray="10 14"
          animate={{ strokeDashoffset: [0, -240] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
        />
        <motion.path
          d="M-100 620 C 240 500, 560 760, 920 560 C 1180 420, 1360 620, 1540 520"
          stroke={mood.stroke}
          strokeWidth="1.25"
          strokeDasharray="8 16"
          animate={{ strokeDashoffset: [0, 240] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />
        <motion.path
          d="M120 -40 C 340 240, 260 580, 620 940"
          stroke={mood.stroke}
          strokeWidth="1"
          strokeDasharray="6 18"
          animate={{ strokeDashoffset: [0, -180] }}
          transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
        />
      </svg>

      {/* Gentle floating light motes */}
      {MOTES.map((mote) => (
        <motion.span
          key={mote.id}
          className="absolute rounded-full bg-blue-500/20"
          style={{
            left: mote.left,
            top: mote.top,
            width: mote.size,
            height: mote.size,
          }}
          animate={{
            y: [0, -28, 12, 0],
            x: [0, 14, -10, 0],
            opacity: [0.25, 0.75, 0.35, 0.25],
            scale: [1, 1.3, 0.9, 1],
          }}
          transition={{
            duration: mote.duration,
            delay: mote.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
