// ============================================================
// Cinematic Intro — two-stage whole-word fall
//
// Timeline (normal motion):
//   0.50s   "AI/ML Engineer"              fades in
//   1.50s   "/"                            fades in
//   2.40s   "Building ◆ Neural Systems"    fades in
//   4.00s   STAGE 1: "AI/ML Engineer" falls whole
//   5.00s   STAGE 2a: "/" falls whole
//   5.20s   STAGE 2b: "Building ◆ Neural Systems" falls whole
//   6.60s   overlay fades out
//   8.00s   overlay removed, hero fires
//
// Reduced-motion: overlay is removed instantly, hero fires immediately.
// ============================================================

(function () {
    function boot() {
        const overlay = document.getElementById('introOverlay');
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // No overlay in DOM, or user prefers reduced motion → skip everything
        if (!overlay || reduced) {
            if (overlay) overlay.classList.add('is-done');
            document.documentElement.classList.remove('intro-locked');
            document.body.classList.add('intro-finished');
            return;
        }

        const w1 = overlay.querySelector('.intro-w1');
        const w2 = overlay.querySelector('.intro-w2');
        const w3 = overlay.querySelector('.intro-w3');

        let finished = false;

        document.documentElement.classList.add('intro-locked');

        function reveal(w, delay) {
            setTimeout(() => w && w.classList.add('is-in'), delay);
        }

        reveal(w1, 500);
        reveal(w2, 1500);
        reveal(w3, 2400);

        function fall(el) {
            if (el) el.classList.add('is-falling');
        }

        function endIntro() {
            if (finished) return;
            finished = true;
            overlay.classList.add('is-fading');
            setTimeout(() => {
                overlay.classList.add('is-done');
                document.documentElement.classList.remove('intro-locked');
                document.body.classList.add('intro-finished');
            }, 1400);
        }

        setTimeout(() => fall(w1), 4000);
        setTimeout(() => fall(w2), 5000);
        setTimeout(() => fall(w3), 5200);
        setTimeout(endIntro, 6600);

        overlay.addEventListener('click', endIntro);
        window.addEventListener('keydown', function onKey(e) {
            if (['Escape', ' ', 'Enter'].includes(e.key)) {
                endIntro();
                window.removeEventListener('keydown', onKey);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();