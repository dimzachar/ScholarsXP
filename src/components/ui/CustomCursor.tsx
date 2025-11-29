"use client";

import React, { useEffect, useRef } from 'react';

const CustomCursor = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;
        let cursorX = mouseX;
        let cursorY = mouseY;

        // Trail points
        const trailPoints: { x: number; y: number }[] = [];
        const maxTrailPoints = 40;

        // Get primary color from CSS variable
        const getPrimaryColor = () => {
            const primaryHSL = getComputedStyle(document.documentElement)
                .getPropertyValue('--primary')
                .trim();
            return primaryHSL;
        };

        // Convert HSL to RGB for canvas
        const hslToRgb = (hslString: string) => {
            const [h, s, l] = hslString.split(' ').map(v => parseFloat(v));
            const sNorm = s / 100;
            const lNorm = l / 100;

            const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
            const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
            const m = lNorm - c / 2;

            let r = 0, g = 0, b = 0;
            if (h >= 0 && h < 60) {
                r = c; g = x; b = 0;
            } else if (h >= 60 && h < 120) {
                r = x; g = c; b = 0;
            } else if (h >= 120 && h < 180) {
                r = 0; g = c; b = x;
            } else if (h >= 180 && h < 240) {
                r = 0; g = x; b = c;
            } else if (h >= 240 && h < 300) {
                r = x; g = 0; b = c;
            } else if (h >= 300 && h < 360) {
                r = c; g = 0; b = x;
            }

            return {
                r: Math.round((r + m) * 255),
                g: Math.round((g + m) * 255),
                b: Math.round((b + m) * 255)
            };
        };

        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        const handleMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        };

        // Initial setup
        handleResize();
        window.addEventListener('resize', handleResize);
        document.addEventListener('mousemove', handleMouseMove);

        const drawTrail = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Get primary color
            const primaryHSL = getPrimaryColor();
            const rgb = hslToRgb(primaryHSL);

            // Draw the trail
            if (trailPoints.length >= 2) {
                for (let i = 1; i < trailPoints.length; i++) {
                    const point = trailPoints[i];
                    const prevPoint = trailPoints[i - 1];

                    // Calculate progress (0 = near cursor/head, 1 = tail/end)
                    const progress = i / trailPoints.length;

                    // Width: thick near cursor, thin at tail
                    const maxWidth = 6;
                    const minWidth = 0.5;
                    const width = maxWidth - (maxWidth - minWidth) * progress;

                    // Opacity: strong near cursor, faint at tail
                    const opacity = 0.9 - 0.6 * progress;

                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
                    ctx.lineWidth = width;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';

                    ctx.moveTo(prevPoint.x, prevPoint.y);
                    ctx.lineTo(point.x, point.y);
                    ctx.stroke();
                }
            }

            // Draw the cursor circle
            ctx.beginPath();
            ctx.arc(cursorX, cursorY, 12, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw the centered dot
            ctx.beginPath();
            ctx.arc(cursorX, cursorY, 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
            ctx.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`;
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
        };

        const animate = () => {
            const speed = 0.4;

            // Update cursor position with smooth interpolation
            cursorX += (mouseX - cursorX) * speed;
            cursorY += (mouseY - cursorY) * speed;

            // Add current cursor position to START of trail array
            trailPoints.unshift({
                x: cursorX,
                y: cursorY,
            });

            // Keep trail length limited
            if (trailPoints.length > maxTrailPoints) {
                trailPoints.pop();
            }

            drawTrail();
            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            document.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 9999,
            }}
        />
    );
};

export default CustomCursor;
