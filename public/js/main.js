// ==========================================================================
// Campus Equipment Lending Exchange - Vanilla Client Interactions
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  // 1. Loading state feedback on form submissions to prevent double submissions
  const forms = document.querySelectorAll('form');
  forms.forEach((form) => {
    form.addEventListener('submit', (e) => {
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn && !submitBtn.disabled) {
        const loadingText = submitBtn.getAttribute('data-loading-text');
        if (loadingText) {
          submitBtn.setAttribute('data-original-text', submitBtn.innerHTML);
          submitBtn.innerHTML = loadingText;
        } else {
          submitBtn.setAttribute('data-original-text', submitBtn.innerHTML);
          submitBtn.innerHTML = 'Processing...';
        }
        submitBtn.disabled = true;
      }
    });
  });

  // 2. Destructive action confirmations
  const confirmElements = document.querySelectorAll('[data-confirm]');
  confirmElements.forEach((el) => {
    el.addEventListener('click', (e) => {
      const message = el.getAttribute('data-confirm') || 'Are you sure you want to proceed?';
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return false;
      }
    });
  });

  // 3. Alert close handlers
  const alertCloses = document.querySelectorAll('.alert-close');
  alertCloses.forEach((btn) => {
    btn.addEventListener('click', () => {
      const alertBox = btn.closest('.alert-box');
      if (alertBox) {
        alertBox.style.display = 'none';
      }
    });
  });
});
