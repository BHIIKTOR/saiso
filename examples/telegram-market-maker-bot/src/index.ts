import {
  applyFill,
  buildPauseReasons,
  buildTwoSidedQuote,
  createDefaultMmLimits,
  createDefaultMmSnapshot,
  nextSnapshotAfterQuote,
  statusMessage,
} from './telegram-market-maker.example';

function runDemo(): void {
  const limits = createDefaultMmLimits();
  let snapshot = createDefaultMmSnapshot();

  const quote = buildTwoSidedQuote(
    {
      midPrice: 3200,
      desiredNotionalUsd: 300,
    },
    limits
  );
  snapshot = nextSnapshotAfterQuote(snapshot, quote);
  snapshot = applyFill(snapshot, { side: 'buy', notionalUsd: 120, pnlImpactUsd: 2.4 });
  snapshot = applyFill(snapshot, { side: 'sell', notionalUsd: 90, pnlImpactUsd: 1.1 });

  const pauseReasons = buildPauseReasons(snapshot, limits);

  console.log('=== telegram-market-maker-bot demo ===');
  console.log(
    'quote bid=' +
      quote.bidPrice.toFixed(2) +
      ' ask=' +
      quote.askPrice.toFixed(2) +
      ' size=' +
      quote.baseSize.toFixed(4)
  );
  console.log('');
  console.log(statusMessage(snapshot, limits));
  console.log('');
  console.log('pause reasons: ' + (pauseReasons.length === 0 ? 'none' : pauseReasons.join(', ')));
}

runDemo();
