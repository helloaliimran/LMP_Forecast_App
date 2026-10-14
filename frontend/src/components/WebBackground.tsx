import { useEffect, useRef } from 'react'

/** Lightweight animated "spider web" of dots for the login and register pages; dots move away from the pointer. */
export default function WebBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const pointer = { x: -9999, y: -9999 }
    let frame = 0
    let dots: { x: number; y: number; vx: number; vy: number }[] = []

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(110, Math.floor((window.innerWidth * window.innerHeight) / 14000))
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
      }))
    }

    const draw = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      ctx.clearRect(0, 0, w, h)
      for (const d of dots) {
        const dx = d.x - pointer.x
        const dy = d.y - pointer.y
        const dist = Math.hypot(dx, dy)
        if (dist < 120 && dist > 0) {
          d.x += (dx / dist) * 1.5
          d.y += (dy / dist) * 1.5
        }
        d.x += d.vx
        d.y += d.vy
        if (d.x < 0 || d.x > w) d.vx *= -1
        if (d.y < 0 || d.y > h) d.vy *= -1
      }
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dist = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y)
          if (dist < 130) {
            ctx.strokeStyle = `rgba(79,195,247,${0.25 * (1 - dist / 130)})`
            ctx.beginPath()
            ctx.moveTo(dots[i].x, dots[i].y)
            ctx.lineTo(dots[j].x, dots[j].y)
            ctx.stroke()
          }
        }
      }
      ctx.fillStyle = 'rgba(127,220,255,0.8)'
      for (const d of dots) {
        ctx.beginPath()
        ctx.arc(d.x, d.y, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }
      frame = requestAnimationFrame(draw)
    }

    const move = (e: PointerEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
    }
    const leave = () => {
      pointer.x = -9999
      pointer.y = -9999
    }

    resize()
    draw()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerleave', leave)
    }
  }, [])

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0 }} />
}
