// ============================================================
//  SCROLL REVEAL
// ============================================================
(function () {
    function run() {
        const targets = document.querySelectorAll(
            '.region-label, .section-title, .exp-item, .project-card, ' +
            '.skill-category, .cert-item'
        );
        if (!targets.length) return;

        targets.forEach(el => el.setAttribute('data-reveal', ''));

        const revealed = new WeakMap();

        function check() {
            const h = window.innerHeight;
            targets.forEach(el => {
                const r = el.getBoundingClientRect();
                const inRevealZone = r.top < h * 0.88 && r.bottom > h * 0.12;
                const fullyOut = r.bottom < -80 || r.top > h + 80;

                if (inRevealZone && !revealed.get(el)) {
                    el.classList.add('revealed');
                    revealed.set(el, true);
                } else if (fullyOut && revealed.get(el)) {
                    el.classList.remove('revealed');
                    revealed.set(el, false);
                }
            });
        }

        let ticking = false;
        function onScroll() {
            if (!ticking) {
                requestAnimationFrame(() => { check(); ticking = false; });
                ticking = true;
            }
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        check();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();


// ============================================================
//  VIDEO FADE — hero video, smooth in/out
// ============================================================
(function () {
    function init() {
        const video = document.querySelector('.bg-video');
        const hero = document.getElementById('hero');
        if (!video || !hero) return;

        let ticking = false;
        let current = 0;    // 0..1 — smoothly interpolated

        function targetOpacity() {
            const r = hero.getBoundingClientRect();
            const vh = window.innerHeight;

            // Fully visible when hero is centered, fades out as it scrolls away
            // Hero visible zone: from top of hero at viewport top → bottom of hero at viewport bottom
            const heroCenter = r.top + r.height / 2;
            const distanceFromCenter = Math.abs(heroCenter - vh / 2);
            const maxDistance = vh * 0.9;

            // 1 when hero centered, 0 when hero fully out
            const t = Math.max(0, 1 - distanceFromCenter / maxDistance);
            return 0.65 * t;    // 0.65 = max opacity
        }

        function loop() {
            const target = targetOpacity();
            current += (target - current) * 0.08;
            video.style.opacity = current.toFixed(3);
            requestAnimationFrame(loop);
        }

        // Pause loop when tab hidden (optional, keeps CPU clean)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) requestAnimationFrame(loop);
        });

        requestAnimationFrame(loop);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();


// ============================================================
//  NAV ACTIVE STATE
// ============================================================
(function () {
    function init() {
        const links = document.querySelectorAll('.bottom-nav-link');
        const sections = document.querySelectorAll('section[id]');
        if (!links.length || !sections.length) return;

        function update() {
            const mid = window.innerHeight / 2;
            let active = null;
            sections.forEach(sec => {
                const r = sec.getBoundingClientRect();
                if (r.top <= mid && r.bottom > mid) active = sec.id;
            });
            links.forEach(link => {
                const target = link.getAttribute('href').replace('#', '');
                link.classList.toggle('active', target === active);
            });
        }

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => { update(); ticking = false; });
                ticking = true;
            }
        }, { passive: true });
        update();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ============================================================
//  CGPA COUNTER — scroll-based, fires reliably
// ============================================================
(function () {
    function init() {
        const counters = document.querySelectorAll('.count-up');
        if (!counters.length) return;

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        function animate(el) {

            const target = parseFloat(el.dataset.target);
            const decimals = parseInt(el.dataset.decimals, 10) || 0;
            if (isNaN(target)) return;

            if (reduced) {
                el.textContent = target.toFixed(decimals);
                return;
            }

            const duration = 3000;
            const start = performance.now();

            function frame(now) {
                const t = Math.min(1, (now - start) / duration);
                const eased = 1 - Math.pow(1 - t, 3);
                el.textContent = (target * eased).toFixed(decimals);
                if (t < 1) requestAnimationFrame(frame);
                else el.textContent = target.toFixed(decimals);
            }
            requestAnimationFrame(frame);
        }

        const inView = new WeakMap();

        function tryAnimate() {
            const vh = window.innerHeight;
            counters.forEach(el => {
                const r = el.getBoundingClientRect();
                const visible = r.top < vh * 0.9 && r.bottom > 0;

                if (visible && !inView.get(el)) {
                    // entered view → start counting
                    inView.set(el, true);
                    animate(el);
                } else if (!visible && inView.get(el)) {
                    // left view → reset so it replays next time
                    inView.set(el, false);
                    el.textContent = '0.00';
                }
            });
        }

        let ticking = false;
        function onScroll() {
            if (!ticking) {
                requestAnimationFrame(() => { tryAnimate(); ticking = false; });
                ticking = true;
            }
        }
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });

        // Try now, then again shortly after (layout might not be ready)
        tryAnimate();
        setTimeout(tryAnimate, 400);
        setTimeout(tryAnimate, 1200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();


// ============================================================
//  TEXT SCRAMBLE — Degree + Institute specs
//  One letter locks at a time, left to right.
//  Re-plays every time it enters view (scroll up OR down).
// ============================================================
(function () {
    function init() {
        const targets = document.querySelectorAll('.scramble');
        if (!targets.length) return;

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

        const LOCK_INTERVAL = 220;   // ms between each letter locking  ← change this to make it faster/slower
        const FRAME_MS      = 90;   // how often scrambled letters re-randomize  ← higher = calmer

        targets.forEach(el => {
            const finalText = (el.dataset.final || el.textContent || '').trim();
            if (!finalText) return;

            el.textContent = finalText;
            if (reduced) return;

            const len = finalText.length;

            // Precompute which index each non-space char occupies in the lock order
            const lockOrder = new Array(len).fill(-1);
            let scrambleableCount = 0;
            for (let i = 0; i < len; i++) {
                if (finalText[i] !== ' ') {
                    lockOrder[i] = scrambleableCount++;
                }
            }

            let timer = 0;
            let startTime = 0;
            let running = false;

            function randomChar() {
                return CHARS[(Math.random() * CHARS.length) | 0];
            }

            function render() {
                if (!running) return;

                const elapsed = performance.now() - startTime;
                const locked = Math.floor(elapsed / LOCK_INTERVAL);

                let out = '';
                for (let i = 0; i < len; i++) {
                    const ch = finalText[i];
                    if (ch === ' ') { out += ' '; continue; }

                    if (lockOrder[i] < locked) {
                        out += ch;                 // locked → real letter
                    } else {
                        out += randomChar();       // still scrambling
                    }
                }

                el.textContent = out;

                if (locked >= scrambleableCount) {
                    el.textContent = finalText;
                    running = false;
                    return;
                }

                timer = setTimeout(render, FRAME_MS);
            }

            function start() {
                if (running) return;
                running = true;
                startTime = performance.now();
                render();
            }

            function reset() {
                running = false;
                clearTimeout(timer);
                el.textContent = finalText;
            }

            const io = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        start();
                    } else {
                        reset();      // ← resets so next time it enters, it replays
                    }
                });
            }, { threshold: 0.35 });

            io.observe(el);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ============================================================
//  3D TILT — project cards + experience cards
// ============================================================
(function () {
    function init() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (window.matchMedia('(hover: none)').matches) return;

        const cards = document.querySelectorAll('.project-card, .exp-item');
        if (!cards.length) return;

        const MAX_TILT = 6;

        cards.forEach(card => {
            let raf = 0;
            let tx = 0, ty = 0, cx = 0, cy = 0;
            let active = false;

            function loop() {
                cx += (tx - cx) * 0.18;
                cy += (ty - cy) * 0.18;
                card.style.setProperty('--ry', cx.toFixed(2) + 'deg');
                card.style.setProperty('--rx', (-cy).toFixed(2) + 'deg');

                if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) {
                    raf = requestAnimationFrame(loop);
                } else {
                    raf = 0;
                }
            }

            function startLoop() {
                if (raf) return;
                raf = requestAnimationFrame(loop);
            }

            card.addEventListener('pointerenter', (e) => {
                if (e.pointerType === 'touch') return;
                active = true;
                card.classList.add('is-tilting');
            });

            card.addEventListener('pointermove', (e) => {
                if (!active || e.pointerType === 'touch') return;
                const rect = card.getBoundingClientRect();
                const px = (e.clientX - rect.left) / rect.width;
                const py = (e.clientY - rect.top) / rect.height;
                tx = (px - 0.5) * 2 * MAX_TILT;
                ty = (py - 0.5) * 2 * MAX_TILT;
                startLoop();
            });

            card.addEventListener('pointerleave', (e) => {
                if (e.pointerType === 'touch') return;
                active = false;
                tx = 0;
                ty = 0;
                startLoop();
                setTimeout(() => card.classList.remove('is-tilting'), 400);
            });

            card.addEventListener('blur', () => {
                active = false;
                tx = 0; ty = 0;
                startLoop();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();


// ============================================================
//  SKILL CHIPS — stagger + tooltips + project highlight
// ============================================================
(function () {
    function init() {
        const categories = document.querySelectorAll('.skill-category');
        if (!categories.length) return;

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        categories.forEach(cat => {
            const chips = cat.querySelectorAll('.chip');
            const wrapper = cat.querySelector('.skill-chips');
            if (!wrapper) return;

            chips.forEach((chip, i) => {
                chip.style.setProperty('--chip-i', i);
            });

            if (!reduced) {
                wrapper.classList.add('js-stagger');
                const io = new IntersectionObserver(entries => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            cat.classList.add('in-view');
                            io.unobserve(cat);
                        }
                    });
                }, { threshold: 0.25 });
                io.observe(cat);
            }
        });

        function flashProject(projectId) {
            const el = document.getElementById(projectId);
            if (!el) return;

            const targetY = el.getBoundingClientRect().top + window.scrollY
                - (window.innerHeight / 2 - el.offsetHeight / 2);
            window.scrollTo({ top: targetY, behavior: 'smooth' });

            setTimeout(() => {
                el.classList.remove('flash');
                void el.offsetWidth;
                el.classList.add('flash');
                setTimeout(() => el.classList.remove('flash'), 2100);
            }, 700);
        }

        document.querySelectorAll('.chip[data-projects]').forEach(chip => {
            const raw = chip.getAttribute('data-projects');
            if (!raw || !raw.trim()) return;

            chip.setAttribute('role', 'button');
            chip.setAttribute('tabindex', '0');

            function trigger() {
                const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
                if (ids.length) flashProject(ids[0]);
            }

            chip.addEventListener('click', trigger);
            chip.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    trigger();
                }
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();