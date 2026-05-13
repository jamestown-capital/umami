export const initInteractionScore = track => {
  let score = 0;
  let lastSent = 0;
  let pointerMoveThrottled = false;
  let scrollThrottled = false;

  const incrementScore = amount => {
    score += amount;
  };

  const handlePointerMove = () => {
    if (!pointerMoveThrottled) {
      incrementScore(1);
      pointerMoveThrottled = true;
      setTimeout(() => {
        pointerMoveThrottled = false;
      }, 100);
    }
  };

  const handleScroll = () => {
    if (!scrollThrottled) {
      incrementScore(1);
      scrollThrottled = true;
      setTimeout(() => {
        scrollThrottled = false;
      }, 100);
    }
  };

  const handleClick = () => incrementScore(5);
  const handleKeyDown = () => incrementScore(2);

  const sendScore = () => {
    if (score > lastSent) {
      track('interaction_score', { score });
      lastSent = score;
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      sendScore();
      track('tab_exited');
    }
  };

  const handlePageHide = () => {
    sendScore();
  };

  document.addEventListener('mousemove', handlePointerMove);
  document.addEventListener('touchmove', handlePointerMove);
  document.addEventListener('scroll', handleScroll, true);
  document.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);

  setInterval(sendScore, 10000);
};
