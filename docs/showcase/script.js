document.addEventListener('DOMContentLoaded', () => {
    // Scroll Animations Observer
    const observerOptions = {
        threshold: 0.2
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, observerOptions);

    // Elements to animate
    const animateElements = document.querySelectorAll('.animate-up, .fade-in');
    animateElements.forEach(el => observer.observe(el));

    // Smooth scroll for nav links
    document.querySelectorAll('.nav-links a').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            document.querySelector(targetId).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Dynamic Stat Counters (Optional but "WOW")
    const stats = document.querySelectorAll('.stat-value');
    stats.forEach(stat => {
        const target = parseFloat(stat.innerText);
        const suffix = stat.innerText.replace(/[0-9.]/g, '');
        let current = 0;
        const increment = target / 50;

        const updateCount = () => {
            if (current < target) {
                current += increment;
                stat.innerText = Math.ceil(current) + suffix;
                setTimeout(updateCount, 20);
            } else {
                stat.innerText = target + suffix;
            }
        };

        // Only trigger when hero is visible
        updateCount();
    });
});
