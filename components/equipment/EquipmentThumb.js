'use client';
import { useEffect, useRef } from 'react';
import { getEquipmentDef } from '../../game/config.js';
import { drawEquipmentShape } from '../../game/render/draw/equipment.js';

const TILE = 48;

/** Miniatura do aparelho com o mesmo desenho usado na grade (no visual do nível). */
export default function EquipmentThumb({ type, level = 1, size = 64 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    const [w, h] = getEquipmentDef(type).size;
    const scale = (size * 0.9) / (Math.max(w, h) * TILE);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, (size * dpr) / 2, (size * dpr) / 2);
    drawEquipmentShape(ctx, type, w * TILE, h * TILE, 0.5, { level, active: false, on: false });
  }, [type, level, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />;
}
