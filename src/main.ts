import '@fontsource/inter-tight/300.css';
import '@fontsource/inter-tight/400.css';
import '@fontsource/inter-tight/500.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './design/styles.css';

import type { AskQueryResult, DatasetBundle, Day, Fact, StoryPlan, Transaction } from '../contracts/index.js';
import daysJson from '../data/days.json';
import factsJson from '../data/facts.json';
import transactionsJson from '../data/transactions.json';
import planJson from '../story/plan.json';
import { answerQuestionDeterministically } from './ask/index.js';
import { registerBespokeChapters } from './chapters/bespoke/index.js';
import { FinScopeApp } from './finscope/finscope-app.js';
import { StoryPlayer, installCaptureBridge, type YearAppCaptureBridge } from './player/index.js';

export interface BootstrappedApp {
  finscope?: FinScopeApp;
  player?: StoryPlayer;
  bridge?: YearAppCaptureBridge;
}

export function bootstrapApp(root: HTMLElement): BootstrappedApp {
  const transactions = transactionsJson as unknown as readonly Transaction[];
  const days = daysJson as unknown as readonly Day[];
  const facts = factsJson as unknown as readonly Fact[];
  const plan = planJson as unknown as StoryPlan;

  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const forceLegacyStory =
    Boolean(params?.get('film') === '1' || params?.get('chapter') || params?.get('legacy') === '1');

  if (!forceLegacyStory) {
    const initialBundle: DatasetBundle = {
      transactions: [...transactions],
      days: [...days],
      facts: [...facts],
      plan,
    };
    const finscope = new FinScopeApp(root, initialBundle);
    return { finscope };
  }

  const player = new StoryPlayer(root, {
    transactions,
    days,
    facts,
    plan,
  });

  registerBespokeChapters(player);

  player.setCustomAskExecutor((question: string): Promise<AskQueryResult> | AskQueryResult => {
    const activeTransactions = player.data.transactions;
    const immediate = answerQuestionDeterministically(question, activeTransactions);
    if (
      typeof window !== 'undefined' &&
      !navigator.webdriver &&
      !window.location.search.includes('film=1')
    ) {
      void (async (): Promise<void> => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3500);
          const resp = await fetch('api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, transactions: activeTransactions }),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (resp.ok) {
            const data = (await resp.json()) as AskQueryResult;
            if (
              data &&
              typeof data.answerable === 'boolean' &&
              data.source === 'model' &&
              (data.formatted_answer !== immediate.formatted_answer ||
                data.interpretation !== immediate.interpretation)
            ) {
              player.renderAskResult(data, 960, 200);
            }
          }
        } catch {
          // Offline or no api/ask server running — deterministic result is already displayed
        }
      })();
    }
    return immediate;
  });

  const bridge = installCaptureBridge(player);

  root.dataset.ready = 'true';
  root.dataset.transactions = String(transactions.length);
  root.dataset.chapters = String(plan.chapters.length);
  root.dataset.person = plan.person_name;

  if (params?.get('film') === '1') {
    bridge.startFilm();
  } else if (params?.get('chapter')) {
    bridge.goToChapter(params.get('chapter')!);
  }

  return { player, bridge };
}

const rootEl = typeof document !== 'undefined' ? document.getElementById('app') : null;
if (rootEl) {
  bootstrapApp(rootEl);
}
