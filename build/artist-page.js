// Artist page functionality - slider navigation and enlarge overlay
// This provides consistent behavior across all artist pages

(function($) {
    'use strict';

    $(document).ready(function() {
        // ===== SLIDER NAVIGATION =====
        // Fix slider navigation to update URL hash dynamically
        var sliderContainer = $('.bx-wrapper');
        if (sliderContainer.length) {
            // Check if we're in slider view or should enable slider mode
            var isSliderView = window.location.search.indexOf('view=slider') !== -1;
            var baseUrl = window.location.pathname;
            if (isSliderView) {
                baseUrl += window.location.search;
            } else {
                baseUrl += '?view=slider';
            }

            // Get all slides
            var slides = $('.slide', sliderContainer);
            var totalSlides = slides.length;
            var isNavigating = false;

            // Function to get current visible slide index (1-based)
            function getCurrentSlideIndex() {
                var visibleSlide = slides.filter('[aria-hidden="false"]').first();
                if (visibleSlide.length) {
                    var slideData = visibleSlide.find('[data-slide]').attr('data-slide');
                    if (slideData) {
                        return parseInt(slideData);
                    }
                }
                // Fallback: check display style
                var visible = slides.filter(function() {
                    return $(this).css('display') === 'block';
                }).first();
                if (visible.length) {
                    var slideData = visible.find('[data-slide]').attr('data-slide');
                    if (slideData) return parseInt(slideData);
                    return slides.index(visible) + 1;
                }
                return 1;
            }

            // Function to update prev/next button hrefs
            function updateButtonHrefs() {
                var current = getCurrentSlideIndex();
                var prev = current > 1 ? current - 1 : totalSlides;
                var next = current < totalSlides ? current + 1 : 1;

                $('.bx-prev').attr('href', baseUrl + '#' + prev);
                $('.bx-next').attr('href', baseUrl + '#' + next);
            }

            // Function to go to slide by number
            function goToSlide(slideNum) {
                if (isNavigating) {
                    return;
                }
                isNavigating = true;

                var targetSlide = slides.filter(function() {
                    var slideData = $(this).find('[data-slide]').attr('data-slide');
                    return slideData && parseInt(slideData) === slideNum;
                }).first();

                if (targetSlide.length) {
                    // Hide all slides
                    slides.attr('aria-hidden', 'true').css({'display': 'none', 'z-index': 0});
                    // Show target slide
                    targetSlide.attr('aria-hidden', 'false').css({'display': 'block', 'z-index': 50});
                    updateButtonHrefs();

                    // Update URL hash
                    var url = baseUrl + '#' + slideNum;
                    if (window.location.href.split('#')[0] + (window.location.hash || '') !== url) {
                        window.history.replaceState(null, null, url);
                    }
                }

                setTimeout(function() {
                    isNavigating = false;
                }, 300);
            }

            // Handle prev/next button clicks
            $('.bx-prev, .bx-next').on('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                var isNext = $(this).hasClass('bx-next');
                var current = getCurrentSlideIndex();
                var target = isNext ? (current < totalSlides ? current + 1 : 1) : (current > 1 ? current - 1 : totalSlides);

                goToSlide(target);
                return false;
            });

            // Watch for slide changes (in case bxSlider changes them)
            var lastSlide = getCurrentSlideIndex();
            setInterval(function() {
                var current = getCurrentSlideIndex();
                if (current !== lastSlide && !isNavigating) {
                    updateButtonHrefs();
                    var url = baseUrl + '#' + current;
                    if (window.location.href.split('#')[0] + (window.location.hash || '') !== url) {
                        window.history.replaceState(null, null, url);
                    }
                    lastSlide = current;
                }
            }, 300);

            // Handle hash changes (browser back/forward)
            $(window).on('hashchange', function() {
                var hash = window.location.hash;
                if (hash) {
                    var slideNum = parseInt(hash.substring(1));
                    if (!isNaN(slideNum) && slideNum >= 1 && slideNum <= totalSlides) {
                        goToSlide(slideNum);
                    }
                }
            });

            // Initialize from hash on load
            var hash = window.location.hash;
            if (hash) {
                var slideNum = parseInt(hash.substring(1));
                if (!isNaN(slideNum) && slideNum >= 1 && slideNum <= totalSlides) {
                    setTimeout(function() { goToSlide(slideNum); }, 100);
                } else {
                    updateButtonHrefs();
                }
            } else {
                updateButtonHrefs();
            }
        }

        // ===== ENLARGE OVERLAY =====
        // Wait for frontendBase.js to load, then override its enlarge handlers
        setTimeout(function() {
            // Bind directly to each enlarge element
            $('.enlarge').each(function() {
                var $el = $(this);
                // Remove data-href to prevent original system from triggering
                $el.removeAttr('data-href');
                // Unbind all existing click handlers
                $el.off('click');
            });

            // Add our custom enlarge handler with direct binding
            $('.enlarge').on('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                var $clicked = $(this);
                var enlargeUrl = $clicked.attr('data-enlarge');
                var slideNum = parseInt($clicked.attr('data-slide')) || 1;

                // Get all slides
                var slides = $('.slide[aria-hidden]').map(function(index) {
                    var $img = $(this).find('img.enlarge');
                    var $caption = $(this).find('figcaption').clone();
                    return {
                        enlargeUrl: $img.attr('data-enlarge'),
                        alt: $img.attr('alt') || '',
                        caption: $caption.html() || ''
                    };
                }).get();

                var currentIndex = slideNum - 1;

                // Create overlay with CLOSE button in upper right
                var overlay = $('<div id="overlay" class="fullscreen" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.98); z-index: 10000;"></div>');

                var header = $('<div class="enlarge-header" style="position: absolute; top: 20px; right: 30px; z-index: 10002;"><span class="links"><a class="link-back back-link" href="#" style="text-decoration: none; color: #000; font-size: 14px; letter-spacing: 1px;">CLOSE</a></span></div>');

                var content = $('<div class="enlarge-content" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-width: 90%; max-height: 85%; display: flex; flex-direction: column; align-items: center;"></div>');

                var img = $('<img style="max-width: 100%; max-height: 100vh; object-fit: contain;" />');
                var caption = $('<figcaption style="margin-top: 20px; text-align: center; color: #666;"></figcaption>');

                function showSlide(index) {
                    var slide = slides[index];
                    img.attr('src', slide.enlargeUrl).attr('alt', slide.alt);
                    caption.html(slide.caption);
                }

                showSlide(currentIndex);

                content.append(img).append(caption);
                overlay.append(header).append(content);

                // Add navigation arrows if more than one slide
                if (slides.length > 1) {
                    var prevArrow = $('<a href="#" class="bx-prev" style="position: absolute; left: 30px; top: 50%; transform: translateY(-50%); font-size: 48px; color: #999; text-decoration: none; z-index: 10001;">&lsaquo;</a>');
                    var nextArrow = $('<a href="#" class="bx-next" style="position: absolute; right: 30px; top: 50%; transform: translateY(-50%); font-size: 48px; color: #999; text-decoration: none; z-index: 10001;">&rsaquo;</a>');

                    prevArrow.on('click', function(e) {
                        e.preventDefault();
                        currentIndex = (currentIndex - 1 + slides.length) % slides.length;
                        showSlide(currentIndex);
                    });

                    nextArrow.on('click', function(e) {
                        e.preventDefault();
                        currentIndex = (currentIndex + 1) % slides.length;
                        showSlide(currentIndex);
                    });

                    overlay.append(prevArrow).append(nextArrow);
                }

                $('body').append(overlay);

                // Close handlers
                $('.link-back', overlay).on('click', function(e) {
                    e.preventDefault();
                    overlay.remove();
                });

                $(document).on('keydown.overlay', function(e) {
                    if (e.key === 'Escape' || e.keyCode === 27) {
                        overlay.remove();
                        $(document).off('keydown.overlay');
                    } else if (e.key === 'ArrowLeft' && slides.length > 1) {
                        currentIndex = (currentIndex - 1 + slides.length) % slides.length;
                        showSlide(currentIndex);
                    } else if (e.key === 'ArrowRight' && slides.length > 1) {
                        currentIndex = (currentIndex + 1) % slides.length;
                        showSlide(currentIndex);
                    }
                });

                overlay.on('click', function(e) {
                    if (e.target === overlay[0]) {
                        overlay.remove();
                        $(document).off('keydown.overlay');
                    }
                });
            });
        }, 100);
    });
})(jQuery);
