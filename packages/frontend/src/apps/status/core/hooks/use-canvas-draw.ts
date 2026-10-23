import { useCallback, useEffect, useRef } from 'react';

interface UseCanvasDrawOptions {
  enabled: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  initialStrokes?: DrawStroke[];
  onChange?: (strokes: DrawStroke[]) => void;
  strokeColor?: string;
  mapPointFromEvent?: (
    event: React.PointerEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ) => DrawPoint | null;
  mapPointToCanvas?: (
    point: DrawPoint,
    canvas: HTMLCanvasElement,
  ) => { x: number; y: number } | null;
}

interface DrawPoint {
  nx: number;
  ny: number;
}

export interface DrawStroke {
  points: DrawPoint[];
  color: string;
  width: number;
}

export const useCanvasDraw = ({
  enabled,
  containerRef,
  canvasRef,
  initialStrokes,
  onChange,
  strokeColor,
  mapPointFromEvent,
  mapPointToCanvas,
}: UseCanvasDrawOptions) => {
  const drawingRef = useRef<{ isDrawing: boolean }>({ isDrawing: false });
  const strokesRef = useRef<DrawStroke[]>([]);
  const dirtyRef = useRef(false);
  const currentStrokeRef = useRef<DrawStroke | null>(null);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current.forEach(stroke => {
      if (stroke.points.length === 0) return;
      ctx.strokeStyle = stroke.color ?? '#ffcc66';
      ctx.lineWidth = stroke.width ?? 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const first = stroke.points[0];
      const firstPoint = mapPointToCanvas
        ? mapPointToCanvas(first, canvas)
        : { x: first.nx * canvas.width, y: first.ny * canvas.height };
      if (!firstPoint) return;
      ctx.moveTo(firstPoint.x, firstPoint.y);
      stroke.points.slice(1).forEach(point => {
        const nextPoint = mapPointToCanvas
          ? mapPointToCanvas(point, canvas)
          : { x: point.nx * canvas.width, y: point.ny * canvas.height };
        if (!nextPoint) return;
        ctx.lineTo(nextPoint.x, nextPoint.y);
      });
      ctx.stroke();
    });
  }, [canvasRef, mapPointToCanvas]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = rect.width;
    canvas.height = rect.height;
    redrawAll();
  }, [canvasRef, containerRef, redrawAll]);

  useEffect(() => {
    resizeCanvas();
    const handleResize = () => resizeCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [resizeCanvas]);

  useEffect(() => {
    if (!enabled) {
      drawingRef.current.isDrawing = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!initialStrokes) return;
    strokesRef.current = [...initialStrokes];
    redrawAll();
  }, [initialStrokes, redrawAll]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!enabled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const point = mapPointFromEvent
        ? mapPointFromEvent(event, canvas)
        : {
            nx: (event.clientX - rect.left) / rect.width,
            ny: (event.clientY - rect.top) / rect.height,
          };
      if (!point) return;
      const stroke: DrawStroke = {
        points: [point],
        color: strokeColor ?? '#ffcc66',
        width: 2,
      };
      strokesRef.current.push(stroke);
      dirtyRef.current = true;
      currentStrokeRef.current = stroke;
      drawingRef.current.isDrawing = true;
      redrawAll();
    },
    [enabled, canvasRef, mapPointFromEvent, redrawAll, strokeColor],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!enabled) return;
      if (!drawingRef.current.isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const stroke = currentStrokeRef.current;
      if (!stroke) return;
      const point = mapPointFromEvent
        ? mapPointFromEvent(event, canvas)
        : {
            nx: (event.clientX - rect.left) / rect.width,
            ny: (event.clientY - rect.top) / rect.height,
          };
      if (!point) return;
      stroke.points.push(point);
      dirtyRef.current = true;
      redrawAll();
    },
    [enabled, canvasRef, mapPointFromEvent, redrawAll],
  );

  const notifyChange = useCallback(() => {
    if (!dirtyRef.current || !onChange) return;
    onChange(strokesRef.current);
    dirtyRef.current = false;
  }, [onChange]);

  // Preserve a final in-progress stroke when leaving the tab before pointerup.
  useEffect(() => () => notifyChange(), [notifyChange]);

  const stopDrawing = useCallback(() => {
    if (!enabled) return;
    drawingRef.current.isDrawing = false;
    currentStrokeRef.current = null;
    notifyChange();
  }, [enabled, notifyChange]);

  const clearCanvas = useCallback(() => {
    strokesRef.current = [];
    dirtyRef.current = true;
    currentStrokeRef.current = null;
    redrawAll();
    notifyChange();
  }, [redrawAll, notifyChange]);

  const setStrokes = useCallback(
    (strokes: DrawStroke[]) => {
      strokesRef.current = strokes;
      currentStrokeRef.current = null;
      redrawAll();
    },
    [redrawAll],
  );

  return {
    resizeCanvas,
    redraw: redrawAll,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: stopDrawing,
    handlePointerLeave: stopDrawing,
    clearCanvas,
    setStrokes,
  };
};
