// Exhibition filtering without URL changes
(function() {
  'use strict';

  console.log('Exhibition filter script loaded');

  let currentFilter = 'View All';
  let currentStartYear = null;
  let currentEndYear = null;
  let currentExpectedCount = 107;
  let allExhibitions = [];
  let observer = null;
  let activeTimeouts = [];
  let activeInterval = null;

  // Wait for DOM to be ready
  document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM ready, initializing filter');
    initExhibitionFilter();
  });

  function initExhibitionFilter() {
    const exhibitionContainer = document.getElementById('past-exhibitions-container');

    console.log('Exhibition container:', exhibitionContainer);

    if (!exhibitionContainer) {
      console.log('ERROR: Missing exhibition container!');
      return;
    }

    // Store all exhibitions with their metadata
    allExhibitions = Array.from(exhibitionContainer.querySelectorAll('.entry')).map(function(el) {
      const h3 = el.querySelector('h3');
      const dateText = h3 ? h3.textContent : '';
      const year = extractYear(dateText);
      return {
        element: el,
        year: year,
        dateText: dateText
      };
    });

    console.log('Exhibitions found:', allExhibitions.length);

    // Set up MutationObserver to watch for re-added elements
    setupMutationObserver(exhibitionContainer);

    // Use EVENT DELEGATION on document to handle clicks on filter links
    // This way even if the links get replaced, our handler still works
    document.addEventListener('click', function(e) {
      // Check if the clicked element is a filter link
      const target = e.target;
      if (target.matches('.links.switch a') || target.closest('.links.switch a')) {
        const link = target.matches('.links.switch a') ? target : target.closest('.links.switch a');
        e.preventDefault();

        const filterText = link.textContent.trim();
        console.log('Filter clicked (via delegation):', filterText);

        // Remove active class from all links
        document.querySelectorAll('.links.switch a').forEach(function(l) {
          l.classList.remove('active');
        });

        // Add active class to clicked link
        link.classList.add('active');

        // Filter exhibitions
        filterExhibitions(filterText);
      }
    });

    console.log('Event delegation set up for filter links');
  }

  function setupMutationObserver(container) {
    // Create observer to watch for added nodes
    observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === 1 && node.classList && node.classList.contains('entry')) {
              // An exhibition was re-added - check if it should be hidden
              const h3 = node.querySelector('h3');
              if (h3) {
                const year = extractYear(h3.textContent);
                if (shouldHideExhibition(year)) {
                  console.log('MutationObserver: Removing re-added element with year:', year);
                  if (node.parentNode) {
                    node.parentNode.removeChild(node);
                  }
                }
              }
            }
          });
        }
      });
    });

    // Start observing
    observer.observe(container, {
      childList: true,
      subtree: false
    });

    console.log('MutationObserver set up successfully');
  }

  function shouldHideExhibition(year) {
    if (currentFilter === 'View All') {
      return false;
    }

    if (currentStartYear === null || currentEndYear === null) {
      return false;
    }

    return !(year && year >= currentStartYear && year <= currentEndYear);
  }

  function filterExhibitions(filterText) {
    console.log('========================================');
    console.log('filterExhibitions called with:', filterText);
    console.log('Previous filter:', currentFilter);

    // Cancel any ongoing re-filtering from previous filter
    console.log('Canceling', activeTimeouts.length, 'timeouts');
    activeTimeouts.forEach(function(id) {
      clearTimeout(id);
    });
    activeTimeouts = [];

    if (activeInterval) {
      console.log('Canceling interval');
      clearInterval(activeInterval);
      activeInterval = null;
    }

    // Update current filter state
    currentFilter = filterText;

    // ALWAYS restore all exhibitions first before filtering
    const container = document.getElementById('past-exhibitions-container');
    console.log('Restoring all exhibitions...');
    allExhibitions.forEach(function(item) {
      if (!item.element.parentNode) {
        container.appendChild(item.element);
      }
    });

    if (filterText === 'View All') {
      console.log('Showing all exhibitions');
      currentStartYear = null;
      currentEndYear = null;
      currentExpectedCount = 107;
      return;
    }

    // Parse year range
    const yearMatch = filterText.match(/(\d{4})-(\d{4})/);
    if (!yearMatch) {
      console.log('No year match found');
      return;
    }

    currentStartYear = parseInt(yearMatch[2], 10);
    currentEndYear = parseInt(yearMatch[1], 10);
    console.log('Filtering for years:', currentStartYear, 'to', currentEndYear);

    let shownCount = 0;
    let hiddenCount = 0;

    allExhibitions.forEach(function(item) {
      if (item.year && item.year >= currentStartYear && item.year <= currentEndYear) {
        // Keep in DOM
        if (!item.element.parentNode) {
          container.appendChild(item.element);
        }
        shownCount++;
      } else {
        // Remove from DOM
        if (item.element.parentNode) {
          item.element.parentNode.removeChild(item.element);
        }
        hiddenCount++;
      }
    });

    currentExpectedCount = shownCount;
    console.log('✓ Filtered - Shown:', shownCount, 'Hidden:', hiddenCount);
    console.log('Expected count set to:', currentExpectedCount);

    // Start aggressive re-filtering using global state
    startAggressiveRefiltering();
  }

  function startAggressiveRefiltering() {
    console.log('Starting aggressive re-filtering...');

    const refilter = function() {
      const container = document.getElementById('past-exhibitions-container');
      const currentCount = container.querySelectorAll('.entry').length;

      if (currentCount !== currentExpectedCount) {
        console.warn('Re-filter: found', currentCount, 'expected', currentExpectedCount, '| Filter:', currentFilter);

        const currentElements = Array.from(container.querySelectorAll('.entry'));
        let removed = 0;

        currentElements.forEach(function(el) {
          const h3 = el.querySelector('h3');
          if (h3) {
            const year = extractYear(h3.textContent);
            if (shouldHideExhibition(year)) {
              if (el.parentNode) {
                el.parentNode.removeChild(el);
                removed++;
              }
            }
          }
        });

        if (removed > 0) {
          console.log('Removed', removed, 'elements');
        }
      }
    };

    // Check multiple times
    activeTimeouts.push(setTimeout(refilter, 50));
    activeTimeouts.push(setTimeout(refilter, 100));
    activeTimeouts.push(setTimeout(refilter, 200));
    activeTimeouts.push(setTimeout(refilter, 500));

    // Keep checking every second
    activeInterval = setInterval(refilter, 1000);

    // Stop after 5 seconds
    activeTimeouts.push(setTimeout(function() {
      if (activeInterval) {
        clearInterval(activeInterval);
        activeInterval = null;
      }
      console.log('Stopped aggressive re-filtering');
    }, 5000));
  }

  function extractYear(dateText) {
    const yearMatch = dateText.match(/\b(20\d{2})\b/);
    return yearMatch ? parseInt(yearMatch[1], 10) : null;
  }
})();
